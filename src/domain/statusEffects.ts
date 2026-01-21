import { StatusEffect } from '../types';

/**
 * Predefined status effects
 */

/**
 * Well Rested (buff): Increases Energy regeneration
 * +50% Energy regen rate
 */
export const WELL_RESTED: Omit<StatusEffect, 'id' | 'expiresAt'> = {
  name: 'Well Rested',
  type: 'buff',
  description: 'You feel refreshed and energized. Energy regenerates faster.',
  statModifiers: {},
  regenerationModifiers: {
    energy: 0.5, // +50% Energy regen
  },
  duration: 2 * 60 * 60 * 1000, // 2 hours
};

/**
 * Burnout (debuff): Decreases Focus regeneration
 * -50% Focus regen rate
 */
export const BURNOUT: Omit<StatusEffect, 'id' | 'expiresAt'> = {
  name: 'Burnout',
  type: 'debuff',
  description: 'You feel mentally exhausted. Focus regenerates slower.',
  statModifiers: {},
  regenerationModifiers: {
    focus: -0.5, // -50% Focus regen
  },
  duration: 4 * 60 * 60 * 1000, // 4 hours
};

/**
 * Get all predefined status effects
 */
export const PREDEFINED_STATUS_EFFECTS = {
  WELL_RESTED,
  BURNOUT,
} as const;

