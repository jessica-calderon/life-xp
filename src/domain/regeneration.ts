import { Character, Stats } from '../types';
import { clampStat, updateStat } from './character';

// Regeneration rates (per second)
export const REGENERATION_RATES: Stats = {
  energy: 0.1, // 0.1 per second = 6 per minute
  focus: 0.05, // 0.05 per second = 3 per minute
  health: 0.02, // 0.02 per second = 1.2 per minute
  mental: 0.08, // 0.08 per second = 4.8 per minute
};

/**
 * Calculate stat regeneration based on time elapsed
 */
export function calculateRegeneration(
  currentStat: number,
  regenerationRate: number,
  timeElapsedSeconds: number
): number {
  const regenerationAmount = regenerationRate * timeElapsedSeconds;
  return clampStat(currentStat + regenerationAmount);
}

/**
 * Apply regeneration to all stats based on time elapsed
 */
export function applyRegeneration(character: Character, currentTime: number): Character {
  const timeElapsed = (currentTime - character.lastRegenerationTime) / 1000; // Convert to seconds
  
  if (timeElapsed <= 0) {
    return character;
  }

  let updatedCharacter = { ...character };
  
  // Regenerate each stat
  updatedCharacter = updateStat(
    updatedCharacter,
    'energy',
    calculateRegeneration(character.stats.energy, REGENERATION_RATES.energy, timeElapsed)
  );
  
  updatedCharacter = updateStat(
    updatedCharacter,
    'focus',
    calculateRegeneration(character.stats.focus, REGENERATION_RATES.focus, timeElapsed)
  );
  
  updatedCharacter = updateStat(
    updatedCharacter,
    'health',
    calculateRegeneration(character.stats.health, REGENERATION_RATES.health, timeElapsed)
  );
  
  updatedCharacter = updateStat(
    updatedCharacter,
    'mental',
    calculateRegeneration(character.stats.mental, REGENERATION_RATES.mental, timeElapsed)
  );

  updatedCharacter.lastRegenerationTime = currentTime;
  
  return updatedCharacter;
}

