import { Character } from '../types';
import { getEffectiveStats } from './character';
import { isFlowActive } from './flowState';

/**
 * Invisible Recovery Debt System
 * 
 * Models deferred fatigue over time. This system operates entirely in the background
 * and never surfaces numerical values to the user. Debt is felt indirectly through
 * system behavior: slower recovery, harder Flow access, stickier Overextended states.
 */

// Constants
const DEBT_MIN = 0.0;
const DEBT_MAX = 1.0;
const DEBT_DEFAULT = 0.0;

// Accumulation rates
const FLOW_DEBT_RATE_PER_MINUTE = 0.002; // +0.002 per minute in Flow
const TASK_DEBT_AMOUNT = 0.01; // +0.01 per task (when conditions met)
const MOMENTUM_SPAM_DEBT_AMOUNT = 0.005; // +0.005 per momentum refresh (when spam < 0.7)

// Decay rates
const IDLE_DECAY_RATE_PER_MINUTE = 0.002; // -0.002 per minute (no tasks for 20+ min)
const RESTED_DECAY_RATE_PER_MINUTE = 0.004; // Additional -0.004 per minute in RESTED
const HIGH_ENERGY_DECAY_RATE_PER_MINUTE = 0.002; // Additional -0.002 per minute (Energy > 85)
const IDLE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes

/**
 * Clamp recovery debt to valid range [0.0, 1.0]
 */
export function clampRecoveryDebt(debt: number): number {
  return Math.max(DEBT_MIN, Math.min(DEBT_MAX, debt));
}

/**
 * Get current recovery debt (defaults to 0.0)
 */
export function getRecoveryDebt(character: Character): number {
  return character.recoveryDebt ?? DEBT_DEFAULT;
}

/**
 * Calculate effective regeneration multiplier based on recovery debt
 * Returns lerp(1.0, 0.7, recoveryDebt)
 * - At 0 debt → 1.0 (full regen)
 * - At max debt → 0.7 (70% regen)
 */
export function getRecoveryDebtRegenMultiplier(character: Character): number {
  const debt = getRecoveryDebt(character);
  // Linear interpolation: 1.0 at debt=0, 0.7 at debt=1.0
  return 1.0 - (debt * 0.3);
}

/**
 * Accumulate debt from Flow State
 * +0.002 per minute while Flow is active
 */
export function accumulateFlowDebt(
  character: Character,
  now: number,
  previousTime: number
): Character {
  const flowState = character.flowState;
  if (!flowState?.startedAt) {
    return character;
  }

  // Check if Flow was active at any point during this period
  const flowStartTime = flowState.startedAt;
  const flowEndTime = flowStartTime + (6 * 60 * 1000); // FLOW_DURATION_MS

  // Flow must overlap with the time period [previousTime, now]
  if (flowEndTime <= previousTime || flowStartTime >= now) {
    return character;
  }

  // Calculate the overlap window where Flow was active during this period
  const activeStartTime = Math.max(flowStartTime, previousTime);
  const activeEndTime = Math.min(flowEndTime, now);

  if (activeEndTime <= activeStartTime) {
    return character;
  }

  const minutesInFlow = (activeEndTime - activeStartTime) / (60 * 1000);
  const debtIncrease = minutesInFlow * FLOW_DEBT_RATE_PER_MINUTE;

  const currentDebt = getRecoveryDebt(character);
  const newDebt = clampRecoveryDebt(currentDebt + debtIncrease);

  return {
    ...character,
    recoveryDebt: newDebt,
  };
}

/**
 * Accumulate debt from task completion
 * +0.01 per task when:
 * - Energy < 40, OR
 * - Ambient State is OVEREXTENDED
 */
export function accumulateTaskDebt(character: Character): Character {
  const effectiveStats = getEffectiveStats(character);
  const ambientState = character.ambientState;

  const shouldAccumulate =
    effectiveStats.energy < 40 || ambientState === 'OVEREXTENDED';

  if (!shouldAccumulate) {
    return character;
  }

  const currentDebt = getRecoveryDebt(character);
  const newDebt = clampRecoveryDebt(currentDebt + TASK_DEBT_AMOUNT);

  return {
    ...character,
    recoveryDebt: newDebt,
  };
}

/**
 * Accumulate debt from momentum refresh spam
 * +0.005 per refresh when task spam multiplier < 0.7
 */
export function accumulateMomentumSpamDebt(character: Character): Character {
  const taskSpamMultiplier = character.taskSpamMultiplier ?? 1.0;

  if (taskSpamMultiplier >= 0.7) {
    return character;
  }

  const currentDebt = getRecoveryDebt(character);
  const newDebt = clampRecoveryDebt(currentDebt + MOMENTUM_SPAM_DEBT_AMOUNT);

  return {
    ...character,
    recoveryDebt: newDebt,
  };
}

/**
 * Decay recovery debt based on recovery conditions
 * 
 * Decay occurs when:
 * 1. No tasks completed for 20+ minutes: -0.002 per minute
 * 2. Ambient State is RESTED: Additional -0.004 per minute
 * 3. Energy > 85: Additional -0.002 per minute
 */
export function decayRecoveryDebt(
  character: Character,
  now: number,
  previousTime: number
): Character {
  const currentDebt = getRecoveryDebt(character);

  if (currentDebt <= 0) {
    return character;
  }

  const timeElapsedMs = now - previousTime;
  const timeElapsedMinutes = timeElapsedMs / (60 * 1000);

  if (timeElapsedMinutes <= 0) {
    return character;
  }

  let totalDecay = 0;

  // Condition 1: No tasks for 20+ minutes
  const lastTaskTime = character.lastTaskCompletedAt;
  const timeSinceLastTask = lastTaskTime ? now - lastTaskTime : Infinity;

  if (timeSinceLastTask >= IDLE_THRESHOLD_MS) {
    totalDecay += IDLE_DECAY_RATE_PER_MINUTE * timeElapsedMinutes;
  }

  // Condition 2: RESTED state (additional decay)
  if (character.ambientState === 'RESTED') {
    totalDecay += RESTED_DECAY_RATE_PER_MINUTE * timeElapsedMinutes;
  }

  // Condition 3: High energy (additional decay)
  const effectiveStats = getEffectiveStats(character);
  if (effectiveStats.energy > 85) {
    totalDecay += HIGH_ENERGY_DECAY_RATE_PER_MINUTE * timeElapsedMinutes;
  }

  const newDebt = clampRecoveryDebt(currentDebt - totalDecay);

  return {
    ...character,
    recoveryDebt: newDebt,
  };
}

/**
 * Process all recovery debt accumulation and decay
 * This should be called during regeneration processing
 */
export function processRecoveryDebt(
  character: Character,
  now: number,
  previousTime: number
): Character {
  let updated = character;

  // First, accumulate from Flow State (if it was active during this period)
  updated = accumulateFlowDebt(updated, now, previousTime);

  // Then, decay based on recovery conditions
  updated = decayRecoveryDebt(updated, now, previousTime);

  return updated;
}

