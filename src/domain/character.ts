import { Character, Stats, StatusEffect, StatType } from '../types';

// Constants
export const MAX_STAT_VALUE = 100;
export const MIN_STAT_VALUE = 0;

/**
 * Calculate XP required for a given level
 * Scales gently: 100 → 130 → 170 → 220 → ...
 * Formula: Level 2 = 100, then increment increases by 10 each level
 */
export function getXPRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level === 2) return 100;
  
  // For level n >= 3: increment = 20 + 10*(n-2)
  // XP = 100 + sum of increments from level 3 to level n
  let total = 100;
  for (let i = 3; i <= level; i++) {
    const increment = 20 + 10 * (i - 2);
    total += increment;
  }
  return total;
}

/**
 * Calculate total XP required to reach a level from level 1
 */
export function getTotalXPForLevel(level: number): number {
  let total = 0;
  for (let i = 2; i <= level; i++) {
    total += getXPRequiredForLevel(i);
  }
  return total;
}

/**
 * Calculate level from total XP
 */
export function getLevelFromXP(totalXP: number): number {
  let level = 1;
  let xpAccumulated = 0;
  
  while (true) {
    const xpForNextLevel = getXPRequiredForLevel(level + 1);
    if (xpAccumulated + xpForNextLevel > totalXP) {
      break;
    }
    xpAccumulated += xpForNextLevel;
    level++;
  }
  
  return level;
}

/**
 * Add XP to character and return updated character
 * Handles level-ups and XP carryover
 */
export function addXP(character: Character, xpAmount: number): Character {
  const currentTotalXP = getTotalXPForLevel(character.level) + character.xp;
  const newTotalXP = currentTotalXP + xpAmount;
  const newLevel = getLevelFromXP(newTotalXP);
  const newXP = newTotalXP - getTotalXPForLevel(newLevel);
  
  const justLeveledUp = newLevel > character.level;
  
  return {
    ...character,
    level: newLevel,
    xp: newXP,
    justLeveledUp: justLeveledUp || undefined,
  };
}

/**
 * Clear the level-up flag
 */
export function clearLevelUpFlag(character: Character): Character {
  return {
    ...character,
    justLeveledUp: undefined,
  };
}

/**
 * Clamp stat value between min and max
 */
export function clampStat(value: number): number {
  return Math.max(MIN_STAT_VALUE, Math.min(MAX_STAT_VALUE, value));
}

/**
 * Apply stat modifiers from status effects
 */
export function applyStatusEffectModifiers(baseStats: Stats, statusEffects: StatusEffect[]): Stats {
  const modifiers: Stats = {
    energy: 0,
    focus: 0,
    health: 0,
    mental: 0,
  };

  statusEffects.forEach((effect) => {
    Object.entries(effect.statModifiers).forEach(([stat, modifier]) => {
      modifiers[stat as StatType] += modifier || 0;
    });
  });

  return {
    energy: clampStat(baseStats.energy + modifiers.energy),
    focus: clampStat(baseStats.focus + modifiers.focus),
    health: clampStat(baseStats.health + modifiers.health),
    mental: clampStat(baseStats.mental + modifiers.mental),
  };
}

/**
 * Get effective stats (base stats + status effect modifiers)
 * Only applies active (non-expired) status effects
 */
export function getEffectiveStats(character: Character): Stats {
  const now = Date.now();
  const activeEffects = character.statusEffects.filter(
    (effect) => effect.expiresAt > now
  );
  return applyStatusEffectModifiers(character.stats, activeEffects);
}

/**
 * Update stat value
 */
export function updateStat(character: Character, statType: StatType, value: number): Character {
  return {
    ...character,
    stats: {
      ...character.stats,
      [statType]: clampStat(value),
    },
  };
}

/**
 * Add status effect to character
 */
export function addStatusEffect(character: Character, effect: Omit<StatusEffect, 'id' | 'expiresAt'>): Character {
  const now = Date.now();
  const newEffect: StatusEffect = {
    ...effect,
    id: `${effect.name}-${now}-${Math.random()}`,
    expiresAt: now + effect.duration,
  };

  return {
    ...character,
    statusEffects: [...character.statusEffects, newEffect],
  };
}

/**
 * Remove expired status effects
 */
export function removeExpiredStatusEffects(character: Character): Character {
  const now = Date.now();
  return {
    ...character,
    statusEffects: character.statusEffects.filter((effect) => effect.expiresAt > now),
  };
}

/**
 * Get active status effects (non-expired)
 */
export function getActiveStatusEffects(character: Character): StatusEffect[] {
  const now = Date.now();
  return character.statusEffects.filter((effect) => effect.expiresAt > now);
}

/**
 * Calculate task reward multiplier based on time since last completion
 * Implements soft cooldown with diminishing returns:
 * - < 10 seconds: multiply by 0.6 (min floor: 0.2)
 * - < 30 seconds: multiply by 0.8
 * - >= 30 seconds: gradually recover toward 1.0 over time
 * 
 * @param timeSinceLastMs Time in milliseconds since last task completion
 * @param currentMultiplier Current multiplier value (default 1.0)
 * @returns New multiplier value
 */
export function getTaskRewardMultiplier(
  timeSinceLastMs: number,
  currentMultiplier: number
): number {
  const TEN_SECONDS = 10 * 1000;
  const THIRTY_SECONDS = 30 * 1000;
  const MIN_MULTIPLIER = 0.2;
  
  // If this is the first task (no previous completion), start at 1.0
  if (timeSinceLastMs === Infinity || timeSinceLastMs < 0) {
    return 1.0;
  }
  
  // If time delta is >= 30 seconds, gradually recover toward 1.0
  if (timeSinceLastMs >= THIRTY_SECONDS) {
    // Recovery: interpolate between current multiplier and 1.0
    // Recovery rate: 0.15 per 30 seconds (smooth recovery)
    // This means full recovery takes ~6.67 periods (200 seconds / 3.3 minutes)
    const recoveryRate = 0.15;
    const recoveryPeriods = timeSinceLastMs / THIRTY_SECONDS;
    const recoveryAmount = Math.min(1.0, recoveryRate * recoveryPeriods);
    const recoveredMultiplier = currentMultiplier + (1.0 - currentMultiplier) * recoveryAmount;
    return Math.max(MIN_MULTIPLIER, Math.min(1.0, recoveredMultiplier));
  }
  
  // Apply diminishing returns for rapid completions
  let newMultiplier = currentMultiplier;
  
  if (timeSinceLastMs < TEN_SECONDS) {
    // Very rapid: reduce by 40% (multiply by 0.6)
    newMultiplier *= 0.6;
  } else if (timeSinceLastMs < THIRTY_SECONDS) {
    // Moderate: reduce by 20% (multiply by 0.8)
    newMultiplier *= 0.8;
  }
  
  // Ensure multiplier doesn't go below minimum
  return Math.max(MIN_MULTIPLIER, newMultiplier);
}

