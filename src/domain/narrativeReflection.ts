import { Character } from '../types';
import { getEffectiveStats } from './character';

/**
 * Derive a narrative reflection from character state
 * Pure function - no UI or store access
 * 
 * Priority order (first match wins):
 * 1. Momentum Active: If there is an active Momentum statusEffect
 * 2. Rested Ambient State: If character.ambientState === 'RESTED'
 * 3. Low Energy / Focus Drift: If energy < 40 OR focus < 40
 * 4. Default: Return null
 */
export function deriveNarrativeReflection(
  character: Character,
  now: number
): string | null {
  const effectiveStats = getEffectiveStats(character);
  
  // 1. Check Momentum Active (highest priority)
  const activeMomentum = character.statusEffects.find(
    (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
  );
  
  if (activeMomentum) {
    // Choose deterministically based on even/odd minute
    const minutes = Math.floor(now / 60000);
    return minutes % 2 === 0
      ? "You're moving with intention right now."
      : "There's a natural rhythm to what you're doing.";
  }
  
  // 2. Check Rested Ambient State
  if (character.ambientState === 'RESTED') {
    // Choose deterministically based on even/odd minute
    const minutes = Math.floor(now / 60000);
    return minutes % 2 === 0
      ? "Nothing needs to be rushed today."
      : "You feel clear and unhurried.";
  }
  
  // 3. Check Low Energy / Focus Drift
  if (effectiveStats.energy < 40 || effectiveStats.focus < 40) {
    // Choose deterministically based on even/odd minute
    const minutes = Math.floor(now / 60000);
    return minutes % 2 === 0
      ? "This feels like a maintenance day."
      : "It's okay to move gently right now.";
  }
  
  // 4. Default: Return null
  return null;
}

/**
 * Get the name of the rule that triggered the reflection
 * Returns: 'Momentum' | 'Rested' | 'Low Energy' | 'None'
 */
export function getNarrativeReflectionRule(
  character: Character,
  now: number
): 'Momentum' | 'Rested' | 'Low Energy' | 'None' {
  const effectiveStats = getEffectiveStats(character);
  
  // 1. Check Momentum Active (highest priority)
  const activeMomentum = character.statusEffects.find(
    (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
  );
  
  if (activeMomentum) {
    return 'Momentum';
  }
  
  // 2. Check Rested Ambient State
  if (character.ambientState === 'RESTED') {
    return 'Rested';
  }
  
  // 3. Check Low Energy / Focus Drift
  if (effectiveStats.energy < 40 || effectiveStats.focus < 40) {
    return 'Low Energy';
  }
  
  // 4. Default: None
  return 'None';
}

