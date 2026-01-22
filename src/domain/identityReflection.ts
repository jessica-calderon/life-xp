import { Character, AmbientState } from '../types';
import { getRecoveryDebt } from './recoveryDebt';
import { getSecondsSinceLastTask } from './flowState';
import { getEffectiveStats } from './character';

/**
 * Context for generating identity reflection
 * All values are derived from existing store state
 */
export interface IdentityReflectionContext {
  ambientState: AmbientState;
  momentumActive: boolean;
  momentumRemainingMs: number; // time until momentum expires
  pauseSinceLastTask: number; // seconds
  recoveryLoad: number; // 0.0 to 1.0 (recovery debt)
  effectiveStats: {
    energy: number;
    focus: number;
    mental: number;
  };
}

/**
 * Generate a passive identity reflection based on current state
 * Pure function - no side effects
 * 
 * Reflection rules (priority order, using broad thresholds):
 * 1. High recovery load (> 0.5) → acknowledge accumulated fatigue
 * 2. Momentum active + balanced (RESTED/CLEAR_HEADED) → observe rhythm
 * 3. Momentum active + overextended → observe sustained effort
 * 4. Long pause (> 5 minutes) without momentum → observe re-entry
 * 5. Low capacity (energy < 30 OR focus < 30 OR mental < 30) → observe limits
 * 6. Clear headed state → observe clarity
 * 7. Rested state → observe readiness
 * 
 * Output: 1 short sentence, observational, non-judgmental, no advice
 * Returns null if no meaningful reflection applies
 */
export function getIdentityReflection(
  context: IdentityReflectionContext
): string | null {
  const {
    ambientState,
    momentumActive,
    momentumRemainingMs,
    pauseSinceLastTask,
    recoveryLoad,
    effectiveStats,
  } = context;

  // Rule 1: High recovery load (> 0.5) → acknowledge accumulated fatigue
  if (recoveryLoad > 0.5) {
    return "Fatigue has been accumulating.";
  }

  // Rule 2: Momentum active + balanced → observe rhythm
  const isBalanced = ambientState === 'RESTED' || ambientState === 'CLEAR_HEADED';
  if (momentumActive && isBalanced) {
    return "There's a steady rhythm to this.";
  }

  // Rule 3: Momentum active + overextended → observe sustained effort
  if (momentumActive && ambientState === 'OVEREXTENDED') {
    return "The pace has been sustained for a while.";
  }

  // Rule 4: Long pause (> 5 minutes) without momentum → observe re-entry
  const LONG_PAUSE_SECONDS = 5 * 60; // 5 minutes
  if (!momentumActive && pauseSinceLastTask > LONG_PAUSE_SECONDS) {
    return "Returning after a pause.";
  }

  // Rule 5: Low capacity (energy < 30 OR focus < 30 OR mental < 30) → observe limits
  if (effectiveStats.energy < 30 || effectiveStats.focus < 30 || effectiveStats.mental < 30) {
    return "Capacity feels limited right now.";
  }

  // Rule 6: Clear headed state → observe clarity
  if (ambientState === 'CLEAR_HEADED') {
    return "The mind feels clear.";
  }

  // Rule 7: Rested state → observe readiness
  if (ambientState === 'RESTED') {
    return "There's a sense of readiness.";
  }

  // No meaningful reflection applies
  return null;
}

/**
 * Get the name of the rule that triggered the reflection
 * Returns rule name or 'None' if no reflection applies
 * Used for debug mode
 */
export function getIdentityReflectionRule(
  context: IdentityReflectionContext
): string {
  const {
    ambientState,
    momentumActive,
    pauseSinceLastTask,
    recoveryLoad,
    effectiveStats,
  } = context;

  // Rule 1: High recovery load
  if (recoveryLoad > 0.5) {
    return 'High Recovery Load';
  }

  // Rule 2: Momentum active + balanced
  const isBalanced = ambientState === 'RESTED' || ambientState === 'CLEAR_HEADED';
  if (momentumActive && isBalanced) {
    return 'Momentum + Balanced';
  }

  // Rule 3: Momentum active + overextended
  if (momentumActive && ambientState === 'OVEREXTENDED') {
    return 'Momentum + Overextended';
  }

  // Rule 4: Long pause without momentum
  const LONG_PAUSE_SECONDS = 5 * 60;
  if (!momentumActive && pauseSinceLastTask > LONG_PAUSE_SECONDS) {
    return 'Long Pause';
  }

  // Rule 5: Low capacity
  if (effectiveStats.energy < 30 || effectiveStats.focus < 30 || effectiveStats.mental < 30) {
    return 'Low Capacity';
  }

  // Rule 6: Clear headed
  if (ambientState === 'CLEAR_HEADED') {
    return 'Clear Headed';
  }

  // Rule 7: Rested
  if (ambientState === 'RESTED') {
    return 'Rested';
  }

  return 'None';
}

/**
 * Create identity reflection context from character state
 * Pure function - derives all values from existing store state
 */
export function createIdentityReflectionContext(
  character: Character,
  now: number
): IdentityReflectionContext {
  // Get ambient state (default to NEUTRAL)
  const ambientState = character.ambientState ?? 'NEUTRAL';

  // Check if momentum is active and get remaining time
  const activeMomentum = character.statusEffects.find(
    (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
  );
  const momentumActive = !!activeMomentum;
  const momentumRemainingMs = activeMomentum
    ? Math.max(0, activeMomentum.expiresAt - now)
    : 0;

  // Calculate pause since last task (in seconds)
  const pauseSinceLastTask = getSecondsSinceLastTask(character, now);

  // Get recovery load (recovery debt)
  const recoveryLoad = getRecoveryDebt(character);

  // Get effective stats
  const effectiveStats = getEffectiveStats(character);

  return {
    ambientState,
    momentumActive,
    momentumRemainingMs,
    pauseSinceLastTask,
    recoveryLoad,
    effectiveStats: {
      energy: effectiveStats.energy,
      focus: effectiveStats.focus,
      mental: effectiveStats.mental,
    },
  };
}

