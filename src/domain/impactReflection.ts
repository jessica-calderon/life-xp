import { AmbientState, Character } from '../types';
import { getRecoveryDebt } from './recoveryDebt';
import { getSecondsSinceLastTask } from './flowState';
import { getEffectiveStats } from './character';

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
  effortTier?: TaskEffortTier; // optional effort tier for subtle reflection variation
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
  const { momentumActive, ambientState, pauseSinceLastTask, recoveryLoad, effortTier } = context;
  
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
  
  // Rule 5: Subtle effort variation (if effort tier is Heavy and not already covered)
  // Only applies if not overextended (already handled above)
  if (effortTier === 'Heavy' && ambientState !== 'OVEREXTENDED') {
    return "Task completed, with weight.";
  }
  
  // Rule 6: Default neutral acknowledgment
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

/**
 * Task Effort Tier
 * Inferred at task completion time based on existing state only
 */
export type TaskEffortTier = 'Light' | 'Standard' | 'Heavy';

/**
 * Context for determining task effort tier
 * All values derived from existing character state
 */
export interface TaskEffortContext {
  currentEnergy: number;
  currentFocus: number;
  ambientState: AmbientState;
  recentTaskCount: number; // tasks completed within last 10 minutes
  now: number;
}

/**
 * Infer task effort tier from completion context
 * Pure function - no side effects, deterministic
 * 
 * Rules (priority order):
 * 1. If Energy < 30 OR Focus < 30 → Heavy
 * 2. If OVEREXTENDED is active → Heavy
 * 3. If multiple tasks completed close together (2+ within 10 min) → Standard
 * 4. Otherwise → Standard (default)
 */
export function getTaskEffortTier(context: TaskEffortContext): TaskEffortTier {
  const { currentEnergy, currentFocus, ambientState, recentTaskCount } = context;
  
  // Rule 1: Low stats → Heavy
  if (currentEnergy < 30 || currentFocus < 30) {
    return 'Heavy';
  }
  
  // Rule 2: Overextended → Heavy
  if (ambientState === 'OVEREXTENDED') {
    return 'Heavy';
  }
  
  // Rule 3: Multiple recent tasks → Standard
  if (recentTaskCount >= 2) {
    return 'Standard';
  }
  
  // Rule 4: Default → Standard
  return 'Standard';
}

/**
 * Create task effort context from character state
 * Pure function - derives all values from existing store state
 */
export function createTaskEffortContext(
  character: Character,
  now: number
): TaskEffortContext {
  const effectiveStats = getEffectiveStats(character);
  const ambientState = character.ambientState ?? 'NEUTRAL';
  
  // Count recent tasks (within last 10 minutes, similar to Momentum logic)
  const lastTaskTimestamps = character.lastTaskTimestamps || [];
  const tenMinutesAgo = now - 10 * 60 * 1000;
  const recentTaskCount = lastTaskTimestamps.filter(ts => ts > tenMinutesAgo).length;
  
  return {
    currentEnergy: effectiveStats.energy,
    currentFocus: effectiveStats.focus,
    ambientState,
    recentTaskCount,
    now,
  };
}

/**
 * Apply effort tier effects to character during task resolution
 * Pure function - returns updated character with subtle mechanical adjustments
 * 
 * Heavy effort:
 * - Extend Momentum duration by 2 minutes (if active)
 * - Ease debuff expiration by 1 minute (reduce decay rate = faster expiration)
 * 
 * Standard effort:
 * - No mechanical changes
 * 
 * Light effort:
 * - No mechanical bonus
 */
export function applyEffortTierEffects(
  character: Character,
  effortTier: TaskEffortTier,
  now: number
): Character {
  if (effortTier !== 'Heavy') {
    // Standard and Light: no mechanical changes
    return character;
  }
  
  // Heavy effort: apply subtle mechanical adjustments
  let updatedCharacter = { ...character };
  
  // 1. Extend Momentum duration by 2 minutes (if active and not OVEREXTENDED)
  const activeMomentum = updatedCharacter.statusEffects.find(
    (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
  );
  
  if (activeMomentum && updatedCharacter.ambientState !== 'OVEREXTENDED') {
    const MOMENTUM_EXTENSION_MS = 2 * 60 * 1000; // 2 minutes
    updatedCharacter = {
      ...updatedCharacter,
      statusEffects: updatedCharacter.statusEffects.map((e) =>
        e.id?.startsWith('momentum-') && e.expiresAt > now
          ? { ...e, expiresAt: e.expiresAt + MOMENTUM_EXTENSION_MS }
          : e
      ),
    };
  }
  
  // 2. Ease debuff expiration by 1 minute (reduce decay rate = faster expiration)
  // Heavy effort is recognized, so debuffs expire slightly sooner
  const DEBUFF_EASING_MS = 1 * 60 * 1000; // 1 minute
  updatedCharacter = {
    ...updatedCharacter,
    statusEffects: updatedCharacter.statusEffects.map((e) =>
      e.type === 'debuff' && e.expiresAt > now
        ? { ...e, expiresAt: Math.max(now + 1000, e.expiresAt - DEBUFF_EASING_MS) } // Ensure it doesn't expire immediately
        : e
    ),
  };
  
  return updatedCharacter;
}

