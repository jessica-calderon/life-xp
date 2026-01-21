import { Character, AmbientState, Stats } from '../types';
import { getEffectiveStats } from './character';

/**
 * Derive the current ambient state from character state
 * Pure function - no UI or store access
 * 
 * Priority order (first match wins):
 * 1. OVEREXTENDED: Energy < 30 OR task spam multiplier < 0.5
 * 2. RESTED: Energy > 80 AND no task completed in last 30 minutes
 * 3. CLEAR_HEADED: Focus > 75 AND Mental > 70
 * 4. NEUTRAL: Fallback
 */
export function deriveAmbientState(character: Character, now: number): AmbientState {
  const effectiveStats = getEffectiveStats(character);
  const taskSpamMultiplier = character.taskSpamMultiplier ?? 1.0;
  const lastTaskCompletedAt = character.lastTaskCompletedAt;
  
  // 1. Check OVEREXTENDED first (highest priority)
  if (effectiveStats.energy < 30 || taskSpamMultiplier < 0.5) {
    return 'OVEREXTENDED';
  }
  
  // 2. Check RESTED
  const thirtyMinutesAgo = now - 30 * 60 * 1000;
  const noRecentTask = !lastTaskCompletedAt || lastTaskCompletedAt < thirtyMinutesAgo;
  if (effectiveStats.energy > 80 && noRecentTask) {
    return 'RESTED';
  }
  
  // 3. Check CLEAR_HEADED
  if (effectiveStats.focus > 75 && effectiveStats.mental > 70) {
    return 'CLEAR_HEADED';
  }
  
  // 4. Default to NEUTRAL
  return 'NEUTRAL';
}

/**
 * Ambient state regeneration multipliers
 * Applied to base regeneration rates
 */
export const AMBIENT_STATE_REGEN_MULTIPLIERS: Record<AmbientState, Partial<Stats>> = {
  RESTED: {
    energy: 0.25, // +25% energy regen
  },
  CLEAR_HEADED: {
    focus: 0.15, // +15% focus regen
  },
  OVEREXTENDED: {
    energy: -0.30, // -30% energy regen
  },
  NEUTRAL: {}, // No modifiers
};

/**
 * Get regeneration multipliers for a given ambient state
 */
export function getAmbientStateRegenMultipliers(state: AmbientState): Partial<Stats> {
  return AMBIENT_STATE_REGEN_MULTIPLIERS[state] || {};
}

