import { Character, FlowState } from '../types';
import { getRecoveryDebt } from './recoveryDebt';

/**
 * Flow State constants
 */
export const FLOW_DURATION_MS = 6 * 60 * 1000; // 6 minutes
export const FLOW_COOLDOWN_MS = 90 * 60 * 1000; // 90 minutes
export const FLOW_MOMENTUM_MIN_DURATION_MS = 8 * 60 * 1000; // 8 minutes
export const FLOW_TASK_SPAM_THRESHOLD = 0.85; // Task spam multiplier must be >= 0.85
export const FLOW_NO_TASK_WINDOW_MS = 60 * 1000; // 60 seconds (no task in last minute)

/**
 * Check if character can enter Flow State
 * Pure function - no store access, no timers, deterministic logic only
 * 
 * Conditions (ALL must be true):
 * 1. Ambient State is RESTED or CLEAR_HEADED
 * 2. Momentum is active AND has been maintained continuously for at least 8 minutes
 * 3. Task spam multiplier >= 0.85
 * 4. No task completion in the last 60 seconds
 * 5. Flow State has NOT been active in the last 90 minutes
 */
export function canEnterFlow(character: Character, now: number): boolean {
  // Condition 1: Ambient State must be RESTED or CLEAR_HEADED
  const ambientState = character.ambientState;
  if (ambientState !== 'RESTED' && ambientState !== 'CLEAR_HEADED') {
    return false;
  }

  // Condition 2: Momentum must be active AND maintained for at least 8 minutes
  const activeMomentum = character.statusEffects.find(
    (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
  );
  
  if (!activeMomentum) {
    return false;
  }
  
  // Check if momentum has been active for at least 8 minutes
  // Momentum ID format: momentum-${timestamp}-${random}
  // Extract the original activation timestamp from the ID
  let momentumStartedAt: number;
  const idParts = activeMomentum.id.split('-');
  if (idParts.length >= 2 && !isNaN(Number(idParts[1]))) {
    // Extract timestamp from ID
    momentumStartedAt = Number(idParts[1]);
  } else {
    // Fallback: use expiresAt - duration (may be inaccurate if refreshed)
    momentumStartedAt = activeMomentum.expiresAt - activeMomentum.duration;
  }
  
  const momentumDuration = now - momentumStartedAt;
  
  if (momentumDuration < FLOW_MOMENTUM_MIN_DURATION_MS) {
    return false;
  }

  // Condition 3: Task spam multiplier >= 0.85
  const taskSpamMultiplier = character.taskSpamMultiplier ?? 1.0;
  if (taskSpamMultiplier < FLOW_TASK_SPAM_THRESHOLD) {
    return false;
  }

  // Condition 4: No task completion in the last 60 seconds
  const lastTaskCompletedAt = character.lastTaskCompletedAt;
  if (lastTaskCompletedAt !== null && lastTaskCompletedAt !== undefined) {
    const timeSinceLastTask = now - lastTaskCompletedAt;
    if (timeSinceLastTask < FLOW_NO_TASK_WINDOW_MS) {
      return false;
    }
  }

  // Condition 5: Flow State has NOT been active in the last 90 minutes
  const flowState = character.flowState;
  if (flowState?.lastEndedAt) {
    const timeSinceFlowEnded = now - flowState.lastEndedAt;
    if (timeSinceFlowEnded < FLOW_COOLDOWN_MS) {
      return false;
    }
  }

  // Condition 6: Recovery debt soft check (debt < 0.6)
  // Flow becomes rarer with high debt, but never impossible
  const recoveryDebt = getRecoveryDebt(character);
  if (recoveryDebt >= 0.6) {
    return false; // Soft condition - fails silently, no feedback shown
  }

  // All conditions met
  return true;
}

/**
 * Check if Flow State is currently active
 */
export function isFlowActive(character: Character, now: number): boolean {
  const flowState = character.flowState;
  if (!flowState?.isActive || !flowState.startedAt) {
    return false;
  }
  
  // Check if Flow has expired
  const flowDuration = now - flowState.startedAt;
  if (flowDuration >= FLOW_DURATION_MS) {
    return false;
  }
  
  return true;
}

/**
 * Create initial Flow State
 */
export function createInitialFlowState(): FlowState {
  return {
    isActive: false,
    startedAt: null,
    lastEndedAt: null,
  };
}

/**
 * Activate Flow State
 */
export function activateFlow(character: Character, now: number): Character {
  return {
    ...character,
    flowState: {
      isActive: true,
      startedAt: now,
      lastEndedAt: character.flowState?.lastEndedAt ?? null,
    },
  };
}

/**
 * Deactivate Flow State (when expired or conditions no longer met)
 */
export function deactivateFlow(character: Character, now: number): Character {
  const flowState = character.flowState;
  if (!flowState?.isActive) {
    return character;
  }
  
  return {
    ...character,
    flowState: {
      isActive: false,
      startedAt: null,
      lastEndedAt: now,
    },
  };
}

/**
 * Get momentum duration in milliseconds
 * Pure function - extracts timestamp from momentum effect ID
 */
export function getMomentumDurationMs(character: Character, now: number): number {
  const activeMomentum = character.statusEffects.find(
    (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
  );
  
  if (!activeMomentum) {
    return 0;
  }
  
  // Extract the original activation timestamp from the ID
  const idParts = activeMomentum.id.split('-');
  if (idParts.length >= 2 && !isNaN(Number(idParts[1]))) {
    const momentumStartedAt = Number(idParts[1]);
    return now - momentumStartedAt;
  } else {
    // Fallback: use expiresAt - duration (may be inaccurate if refreshed)
    return activeMomentum.expiresAt - activeMomentum.duration;
  }
}

/**
 * Get seconds since last task completion
 * Pure function - returns 0 if no task has been completed
 */
export function getSecondsSinceLastTask(character: Character, now: number): number {
  const lastTaskCompletedAt = character.lastTaskCompletedAt;
  if (lastTaskCompletedAt === null || lastTaskCompletedAt === undefined) {
    return 0;
  }
  
  const timeSinceLastTask = now - lastTaskCompletedAt;
  return Math.floor(timeSinceLastTask / 1000);
}

/**
 * Get minutes since last Flow ended
 * Pure function - returns null if Flow has never been active
 */
export function getMinutesSinceLastFlow(character: Character, now: number): number | null {
  const flowState = character.flowState;
  if (!flowState?.lastEndedAt) {
    return null;
  }
  
  const timeSinceFlowEnded = now - flowState.lastEndedAt;
  return Math.floor(timeSinceFlowEnded / (60 * 1000));
}

