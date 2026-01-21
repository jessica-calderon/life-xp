import { Character, Stats, StatusEffect } from '../types';
import { clampStat, updateStat } from './character';
import { getAmbientStateRegenMultipliers } from './ambientState';

// Regeneration rates (per second)
// Energy: +1 every 10 minutes = 1/600 per second
// Focus: +1 every 15 minutes = 1/900 per second
// Mental: +1 every 20 minutes = 1/1200 per second
// Health: +1 every 30 minutes = 1/1800 per second (slowest)
export const BASE_REGENERATION_RATES: Stats = {
  energy: 1 / 600, // +1 per 10 minutes
  focus: 1 / 900, // +1 per 15 minutes
  mental: 1 / 1200, // +1 per 20 minutes
  health: 1 / 1800, // +1 per 30 minutes (slowest)
};

/**
 * Calculate effective regeneration rates with status effect modifiers and ambient state
 */
export function getEffectiveRegenerationRates(
  baseRates: Stats,
  statusEffects: StatusEffect[],
  ambientStateMultipliers?: Partial<Stats>
): Stats {
  const modifiers: Stats = {
    energy: 0,
    focus: 0,
    health: 0,
    mental: 0,
  };

  // Apply status effect modifiers
  statusEffects.forEach((effect) => {
    if (effect.regenerationModifiers) {
      Object.entries(effect.regenerationModifiers).forEach(([stat, modifier]) => {
        modifiers[stat as keyof Stats] += modifier || 0;
      });
    }
  });

  // Apply ambient state multipliers
  if (ambientStateMultipliers) {
    Object.entries(ambientStateMultipliers).forEach(([stat, modifier]) => {
      modifiers[stat as keyof Stats] += modifier || 0;
    });
  }

  return {
    energy: Math.max(0, baseRates.energy * (1 + modifiers.energy)),
    focus: Math.max(0, baseRates.focus * (1 + modifiers.focus)),
    health: Math.max(0, baseRates.health * (1 + modifiers.health)),
    mental: Math.max(0, baseRates.mental * (1 + modifiers.mental)),
  };
}

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
 * Takes into account status effect regeneration modifiers
 */
export function applyRegeneration(character: Character, currentTime: number): Character {
  const timeElapsed = (currentTime - character.lastRegenerationTime) / 1000; // Convert to seconds
  
  if (timeElapsed <= 0) {
    return character;
  }

  // Get effective regeneration rates with status effect modifiers and ambient state
  const activeEffects = character.statusEffects.filter(
    (e) => e.expiresAt > currentTime
  );
  
  // Get ambient state multipliers if ambient state is set
  const ambientStateMultipliers = character.ambientState
    ? getAmbientStateRegenMultipliers(character.ambientState)
    : undefined;
  
  const effectiveRates = getEffectiveRegenerationRates(
    BASE_REGENERATION_RATES,
    activeEffects,
    ambientStateMultipliers
  );

  let updatedCharacter = { ...character };
  
  // Regenerate each stat with effective rates
  updatedCharacter = updateStat(
    updatedCharacter,
    'energy',
    calculateRegeneration(character.stats.energy, effectiveRates.energy, timeElapsed)
  );
  
  updatedCharacter = updateStat(
    updatedCharacter,
    'focus',
    calculateRegeneration(character.stats.focus, effectiveRates.focus, timeElapsed)
  );
  
  updatedCharacter = updateStat(
    updatedCharacter,
    'health',
    calculateRegeneration(character.stats.health, effectiveRates.health, timeElapsed)
  );
  
  updatedCharacter = updateStat(
    updatedCharacter,
    'mental',
    calculateRegeneration(character.stats.mental, effectiveRates.mental, timeElapsed)
  );

  updatedCharacter.lastRegenerationTime = currentTime;
  
  return updatedCharacter;
}

