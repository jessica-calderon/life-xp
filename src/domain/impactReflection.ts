import { AmbientState, Character } from '../types';
import { getRecoveryDebt } from './recoveryDebt';
import { getSecondsSinceLastTask } from './flowState';

/**
 * Context for generating impact reflection
 * All values are derived from existing store state
 */
export interface ImpactReflectionContext {
  momentumActive: boolean;
  ambientState: AmbientState;
  pauseSinceLastTask: number; // seconds
  recoveryLoad: number; // 0.0 to 1.0 (recovery debt)
  energyDelta: number; // stat delta applied (typically -2)
  focusDelta: number; // stat delta applied (typically -1)
}

/**
 * Generate a system-generated impact reflection based on task completion context
 * Pure function - no side effects
 * 
 * Reflection rules (priority order):
 * 1. High recovery load (> 0.5) → emphasize restraint or care
 * 2. Momentum + balanced (RESTED/CLEAR_HEADED) → affirm intentional progress
 * 3. Momentum + overextended → acknowledge effort with caution
 * 4. No momentum + long pause (> 5 minutes) → acknowledge re-entry
 * 5. Default: neutral acknowledgment
 * 
 * Output: 1 short sentence, neutral, non-judgmental, no praise words
 */
export function generateImpactReflection(
  context: ImpactReflectionContext
): string {
  const { momentumActive, ambientState, pauseSinceLastTask, recoveryLoad } = context;
  
  // Rule 1: High recovery load (> 0.5) → emphasize restraint or care
  if (recoveryLoad > 0.5) {
    return "Consider your current capacity.";
  }
  
  // Rule 2: Momentum + balanced → affirm intentional progress
  const isBalanced = ambientState === 'RESTED' || ambientState === 'CLEAR_HEADED';
  if (momentumActive && isBalanced) {
    return "Progress made with intention.";
  }
  
  // Rule 3: Momentum + overextended → acknowledge effort with caution
  if (momentumActive && ambientState === 'OVEREXTENDED') {
    return "Effort noted, with awareness of limits.";
  }
  
  // Rule 4: No momentum + long pause (> 5 minutes) → acknowledge re-entry
  const LONG_PAUSE_SECONDS = 5 * 60; // 5 minutes
  if (!momentumActive && pauseSinceLastTask > LONG_PAUSE_SECONDS) {
    return "Returning to the work.";
  }
  
  // Rule 5: Default neutral acknowledgment
  return "Task completed.";
}

/**
 * Create impact reflection context from character state
 * Pure function - derives all values from existing store state
 */
export function createImpactReflectionContext(
  character: Character,
  now: number,
  energyDelta: number = -2,
  focusDelta: number = -1
): ImpactReflectionContext {
  // Check if momentum is active
  const momentumActive = character.statusEffects.some(
    (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
  );
  
  // Get ambient state (default to NEUTRAL)
  const ambientState = character.ambientState ?? 'NEUTRAL';
  
  // Calculate pause since last task (in seconds)
  const pauseSinceLastTask = getSecondsSinceLastTask(character, now);
  
  // Get recovery load (recovery debt)
  const recoveryLoad = getRecoveryDebt(character);
  
  return {
    momentumActive,
    ambientState,
    pauseSinceLastTask,
    recoveryLoad,
    energyDelta,
    focusDelta,
  };
}

