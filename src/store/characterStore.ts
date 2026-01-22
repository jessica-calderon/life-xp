import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { Character, Stats, StatusEffect } from '../types';
import { addXP, removeExpiredStatusEffects, clearLevelUpFlag, getTaskRewardMultiplier } from '../domain/character';
import { applyRegeneration } from '../domain/regeneration';
import { deriveAmbientState } from '../domain/ambientState';
import { getSecondsSinceLastTask, getMinutesSinceLastFlow, FLOW_TASK_SPAM_THRESHOLD, FLOW_NO_TASK_WINDOW_MS, FLOW_COOLDOWN_MS } from '../domain/flowState';
import { createTaskEffortContext, getTaskEffortTier, applyEffortTierEffects } from '../domain/impactReflection';

const STORAGE_KEY = '@life-xp:character';

// Default character state
const DEFAULT_STATS: Stats = {
  energy: 80,
  focus: 70,
  health: 90,
  mental: 75,
};

const DEFAULT_CHARACTER: Character = {
  level: 1,
  xp: 0,
  stats: DEFAULT_STATS,
  statusEffects: [],
  lastRegenerationTime: Date.now(),
  lastTaskTimestamps: [],
  lastTaskCompletedAt: null,
  taskSpamMultiplier: 1.0,
};

interface CharacterStore {
  character: Character;
  isInitialized: boolean;
  isCompletingTask: boolean; // Guard to prevent overlapping task completions
  
  // Actions
  initialize: () => Promise<void>;
  completeTask: () => void; // Complete a task with spam prevention
  gainXP: (amount: number) => void; // Public API for gaining XP
  addXP: (amount: number) => void; // Internal alias
  clearLevelUpFlag: () => void;
  updateStat: (statType: keyof Stats, value: number) => void;
  addStatusEffect: (effect: Omit<StatusEffect, 'id' | 'expiresAt'>) => void;
  removeStatusEffect: (id: string) => void;
  processRegeneration: () => void;
  resetCharacter: () => Promise<void>;
  jumpTimeBy: (milliseconds: number) => void; // DEV-ONLY: Jump time forward for testing
  
  // Internal
  _saveToStorage: () => Promise<void>;
  _loadFromStorage: () => Promise<Character | null>;
}

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  character: DEFAULT_CHARACTER,
  isInitialized: false,
  isCompletingTask: false,

  initialize: async () => {
    const stored = await get()._loadFromStorage();
    if (stored) {
      // Process regeneration and expired effects on load
      const now = Date.now();
      let character = applyRegeneration(stored, now);
      character = removeExpiredStatusEffects(character);
      // Clear level-up flag on load (it's a session flag)
      character.justLeveledUp = undefined;
      // Initialize lastTaskTimestamps if missing
      if (!character.lastTaskTimestamps) {
        character.lastTaskTimestamps = [];
      }
      // Initialize spam prevention fields if missing
      if (character.lastTaskCompletedAt === undefined) {
        character.lastTaskCompletedAt = null;
      }
      if (character.taskSpamMultiplier === undefined) {
        character.taskSpamMultiplier = 1.0;
      }
      
      // Recalculate ambient state
      character.ambientState = deriveAmbientState(character, now);
      
      set({ character, isInitialized: true });
      await get()._saveToStorage();
    } else {
      const now = Date.now();
      const defaultCharacter = { ...DEFAULT_CHARACTER };
      defaultCharacter.ambientState = deriveAmbientState(defaultCharacter, now);
      set({ character: defaultCharacter, isInitialized: true });
      await get()._saveToStorage();
    }
  },

  completeTask: () => {
    // Prevent overlapping task completions
    if (get().isCompletingTask) return;
    
    set({ isCompletingTask: true });
    
    const { character } = get();
    const now = Date.now();
    
    // Infer effort tier BEFORE applying stat changes (uses current state)
    // Count current task in recent task count for effort calculation
    const lastTaskTimestamps = character.lastTaskTimestamps || [];
    const tenMinutesAgo = now - 10 * 60 * 1000;
    const recentTaskCount = lastTaskTimestamps.filter(ts => ts > tenMinutesAgo).length + 1; // +1 for current task
    const effortContext = {
      ...createTaskEffortContext(character, now),
      recentTaskCount, // Override with count that includes current task
    };
    const effortTier = getTaskEffortTier(effortContext);
    
    // Calculate time since last completion
    const lastTaskTime = character.lastTaskCompletedAt;
    const timeSinceLastMs = lastTaskTime ? now - lastTaskTime : Infinity;
    
    // Get current multiplier (default to 1.0 if not set)
    const currentMultiplier = character.taskSpamMultiplier ?? 1.0;
    
    // Calculate new multiplier based on time delta
    const newMultiplier = getTaskRewardMultiplier(timeSinceLastMs, currentMultiplier);
    
    // Base rewards
    const baseXP = 15;
    const baseEnergyChange = -2;
    const baseFocusChange = -1;
    
    // Apply multiplier to rewards
    const finalXP = Math.round(baseXP * newMultiplier);
    const finalEnergyChange = Math.round(baseEnergyChange * newMultiplier);
    const finalFocusChange = Math.round(baseFocusChange * newMultiplier);
    
    // Track task completion for Momentum
    const updatedTimestamps = [...lastTaskTimestamps, now];
    
    // Remove timestamps older than 10 minutes
    const recentTimestamps = updatedTimestamps.filter(ts => ts > tenMinutesAgo);
    
    // Check if Momentum is currently active
    const activeMomentum = character.statusEffects.find(
      (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
    );
    
    // Check if we should activate Momentum (2+ tasks within 10 minutes)
    const shouldActivateMomentum = recentTimestamps.length >= 2 && !activeMomentum;
    
    // If Momentum is active, refresh it; otherwise activate if conditions are met
    let updatedCharacter: Character = {
      ...character,
      lastTaskTimestamps: recentTimestamps,
      lastTaskCompletedAt: now,
      taskSpamMultiplier: newMultiplier,
    };
    
    // Recalculate ambient state before checking Momentum refresh
    updatedCharacter.ambientState = deriveAmbientState(updatedCharacter, now);
    
    if (activeMomentum) {
      // Refresh Momentum only if not OVEREXTENDED
      // Momentum duration does NOT refresh while OVEREXTENDED is active
      if (updatedCharacter.ambientState !== 'OVEREXTENDED') {
        updatedCharacter = {
          ...updatedCharacter,
          statusEffects: updatedCharacter.statusEffects.map((e) =>
            e.id?.startsWith('momentum-') && e.expiresAt > now
              ? { ...e, expiresAt: now + 15 * 60 * 1000 }
              : e
          ),
        };
      }
    } else if (shouldActivateMomentum) {
      // Activate Momentum
      const momentumEffect: StatusEffect = {
        id: `momentum-${now}-${Math.random()}`,
        name: 'Momentum',
        type: 'buff',
        description: 'You are in rhythm.',
        statModifiers: {},
        regenerationModifiers: {
          energy: 0.2, // +20% Energy regen
        },
        duration: 15 * 60 * 1000, // 15 minutes
        expiresAt: now + 15 * 60 * 1000,
      };
      updatedCharacter = {
        ...updatedCharacter,
        statusEffects: [...updatedCharacter.statusEffects, momentumEffect],
      };
    }
    
    // Apply XP with Momentum bonus (10% increase if active)
    const hasMomentum = updatedCharacter.statusEffects.some(
      (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
    );
    const momentumBonus = hasMomentum ? 1.1 : 1.0;
    const finalXPWithMomentum = Math.round(finalXP * momentumBonus);
    
    // Apply XP
    const xpUpdated = addXP(updatedCharacter, finalXPWithMomentum);
    
    // Apply stat changes
    const energyUpdated = Math.max(0, xpUpdated.stats.energy + finalEnergyChange);
    const focusUpdated = Math.max(0, xpUpdated.stats.focus + finalFocusChange);
    
    let finalCharacter: Character = {
      ...xpUpdated,
      stats: {
        ...xpUpdated.stats,
        energy: energyUpdated,
        focus: focusUpdated,
      },
    };
    
    // Apply effort tier effects (subtle mechanical adjustments)
    finalCharacter = applyEffortTierEffects(finalCharacter, effortTier, now);
    
    // Recalculate ambient state after all updates
    finalCharacter.ambientState = deriveAmbientState(finalCharacter, now);
    
    set({ character: finalCharacter, isCompletingTask: false });
    get()._saveToStorage();
  },

  gainXP: (amount: number) => {
    const { character } = get();
    const now = Date.now();
    
    // Track task completion
    const lastTaskTimestamps = character.lastTaskTimestamps || [];
    const updatedTimestamps = [...lastTaskTimestamps, now];
    
    // Remove timestamps older than 10 minutes
    const tenMinutesAgo = now - 10 * 60 * 1000;
    const recentTimestamps = updatedTimestamps.filter(ts => ts > tenMinutesAgo);
    
    // Check if Momentum is currently active
    const activeMomentum = character.statusEffects.find(
      (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
    );
    
    // Check if we should activate Momentum (2+ tasks within 10 minutes)
    const shouldActivateMomentum = recentTimestamps.length >= 2 && !activeMomentum;
    
    // If Momentum is active, refresh it; otherwise activate if conditions are met
    let updatedCharacter = {
      ...character,
      lastTaskTimestamps: recentTimestamps,
    };
    
    // Recalculate ambient state before checking Momentum refresh
    updatedCharacter.ambientState = deriveAmbientState(updatedCharacter, now);
    
    if (activeMomentum) {
      // Refresh Momentum only if not OVEREXTENDED
      // Momentum duration does NOT refresh while OVEREXTENDED is active
      if (updatedCharacter.ambientState !== 'OVEREXTENDED') {
        updatedCharacter = {
          ...updatedCharacter,
          statusEffects: updatedCharacter.statusEffects.map((e) =>
            e.id?.startsWith('momentum-') && e.expiresAt > now
              ? { ...e, expiresAt: now + 15 * 60 * 1000 }
              : e
          ),
        };
      }
    } else if (shouldActivateMomentum) {
      // Activate Momentum
      const momentumEffect: StatusEffect = {
        id: `momentum-${now}-${Math.random()}`,
        name: 'Momentum',
        type: 'buff',
        description: 'You are in rhythm.',
        statModifiers: {},
        regenerationModifiers: {
          energy: 0.2, // +20% Energy regen
        },
        duration: 15 * 60 * 1000, // 15 minutes
        expiresAt: now + 15 * 60 * 1000,
      };
      updatedCharacter = {
        ...updatedCharacter,
        statusEffects: [...updatedCharacter.statusEffects, momentumEffect],
      };
    }
    
    // Apply XP with Momentum bonus (10% increase if active)
    const hasMomentum = updatedCharacter.statusEffects.some(
      (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
    );
    const finalXP = hasMomentum ? amount * 1.1 : amount;
    
    // Apply XP
    const xpUpdated = addXP(updatedCharacter, finalXP);
    set({ character: xpUpdated });
    get()._saveToStorage();
  },

  addXP: (amount: number) => {
    // Alias for gainXP for backward compatibility
    get().gainXP(amount);
  },

  clearLevelUpFlag: () => {
    const updated = clearLevelUpFlag(get().character);
    set({ character: updated });
    get()._saveToStorage();
  },

  updateStat: (statType: keyof Stats, value: number) => {
    const { character } = get();
    const updated = {
      ...character,
      stats: {
        ...character.stats,
        [statType]: Math.max(0, Math.min(100, value)),
      },
    };
    set({ character: updated });
    get()._saveToStorage();
  },

  addStatusEffect: (effect: Omit<StatusEffect, 'id' | 'expiresAt'>) => {
    const { character } = get();
    const now = Date.now();
    const newEffect: StatusEffect = {
      ...effect,
      id: `${effect.name}-${now}-${Math.random()}`,
      expiresAt: now + effect.duration,
    };
    
    const updated = {
      ...character,
      statusEffects: [...character.statusEffects, newEffect],
    };
    
    set({ character: updated });
    get()._saveToStorage();
  },

  removeStatusEffect: (id: string) => {
    const { character } = get();
    const updated = {
      ...character,
      statusEffects: character.statusEffects.filter((e) => e.id !== id),
    };
    set({ character: updated });
    get()._saveToStorage();
  },

  processRegeneration: () => {
    const { character } = get();
    const now = Date.now();
    let updated = applyRegeneration(character, now);
    updated = removeExpiredStatusEffects(updated);
    // Recalculate ambient state after regeneration
    updated.ambientState = deriveAmbientState(updated, now);
    set({ character: updated });
    get()._saveToStorage();
  },

  resetCharacter: async () => {
    // Clear AsyncStorage
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear character storage:', error);
    }
    // Reset Zustand store to default values with fresh timestamp
    const resetCharacter: Character = {
      ...DEFAULT_CHARACTER,
      lastRegenerationTime: Date.now(),
      lastTaskTimestamps: [],
      lastTaskCompletedAt: null,
      taskSpamMultiplier: 1.0,
    };
    set({ character: resetCharacter, isCompletingTask: false });
    // Save the default state to storage
    await get()._saveToStorage();
  },

  jumpTimeBy: (milliseconds: number) => {
    // DEV-ONLY: This function should never be called in production
    if (!__DEV__) {
      console.warn('jumpTimeBy called in production - this should not happen');
      return;
    }

    const { character } = get();
    const now = Date.now();

    // We adjust timestamps backward (subtract milliseconds) to simulate time passing.
    // This approach ensures all time-delta calculations (regeneration, decay, etc.)
    // work correctly through existing systems rather than directly mutating stats.
    const updatedCharacter: Character = {
      ...character,
      // Adjust main regeneration timestamp - this is the primary timestamp used
      // by applyRegeneration() to calculate stat recovery over time
      lastRegenerationTime: character.lastRegenerationTime - milliseconds,
      
      // Adjust task completion timestamp for spam prevention and flow calculations
      lastTaskCompletedAt: character.lastTaskCompletedAt
        ? character.lastTaskCompletedAt - milliseconds
        : null,
      
      // Adjust all task timestamps in the array (used for Momentum tracking)
      // Each timestamp represents when a task was completed, so we shift them all back
      lastTaskTimestamps: character.lastTaskTimestamps
        ? character.lastTaskTimestamps.map(ts => ts - milliseconds)
        : [],
    };

    // If flowState exists, adjust its timestamps as well
    // Note: flowState may not be in the Character type definition but could exist at runtime
    const flowState = (character as any).flowState;
    if (flowState) {
      (updatedCharacter as any).flowState = {
        ...flowState,
        startedAt: flowState.startedAt ? flowState.startedAt - milliseconds : flowState.startedAt,
        lastEndedAt: flowState.lastEndedAt ? flowState.lastEndedAt - milliseconds : flowState.lastEndedAt,
      };
    }

    // After adjusting timestamps, recompute derived stats using existing regeneration logic.
    // This ensures all progression flows through real game systems (regeneration rates,
    // status effects, ambient state multipliers, etc.) rather than direct stat manipulation.
    let finalCharacter = applyRegeneration(updatedCharacter, now);
    finalCharacter = removeExpiredStatusEffects(finalCharacter);
    
    // Recalculate ambient state after regeneration
    finalCharacter.ambientState = deriveAmbientState(finalCharacter, now);

    set({ character: finalCharacter });
    get()._saveToStorage();
  },

  _saveToStorage: async () => {
    try {
      const character = get().character;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(character));
    } catch (error) {
      console.error('Failed to save character:', error);
    }
  },

  _loadFromStorage: async (): Promise<Character | null> => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data) as Character;
      }
    } catch (error) {
      console.error('Failed to load character:', error);
    }
    return null;
  },
}));

/**
 * Get debug information for Flow Inspector
 * Pure function - takes store state and returns debug info
 */
export function getFlowDebugInfo(
  store: CharacterStore,
  now: number
): {
  ambientStateOk: boolean;
  ambientState: string;
  momentumActive: boolean;
  momentumDurationMs: number;
  spamMultiplierOk: boolean;
  spamMultiplier: number;
  pauseOk: boolean;
  secondsSinceLastTask: number;
  cooldownOk: boolean;
  minutesSinceLastFlow: number | null;
} {
  const character = store.character;
  const ambientState = character.ambientState ?? 'NEUTRAL';
  
  // Check ambient state (should be RESTED or CLEAR_HEADED)
  const ambientStateOk = ambientState === 'RESTED' || ambientState === 'CLEAR_HEADED';
  
  // Check momentum
  const activeMomentum = character.statusEffects.find(
    (e) => e.id?.startsWith('momentum-') && e.expiresAt > now
  );
  const momentumActive = !!activeMomentum;
  
  let momentumDurationMs = 0;
  if (activeMomentum) {
    // Extract timestamp from ID if possible
    const idParts = activeMomentum.id.split('-');
    let momentumStartedAt: number;
    if (idParts.length >= 2 && !isNaN(Number(idParts[1]))) {
      momentumStartedAt = Number(idParts[1]);
    } else {
      // Fallback: use expiresAt - duration
      momentumStartedAt = activeMomentum.expiresAt - activeMomentum.duration;
    }
    momentumDurationMs = now - momentumStartedAt;
  }
  
  // Check spam multiplier
  const spamMultiplier = character.taskSpamMultiplier ?? 1.0;
  const spamMultiplierOk = spamMultiplier >= FLOW_TASK_SPAM_THRESHOLD;
  
  // Check pause (no task in last 60 seconds)
  const secondsSinceLastTask = getSecondsSinceLastTask(character, now);
  const pauseOk = secondsSinceLastTask >= FLOW_NO_TASK_WINDOW_MS / 1000;
  
  // Check cooldown (no flow in last 90 minutes)
  const minutesSinceLastFlow = getMinutesSinceLastFlow(character, now);
  const cooldownOk = minutesSinceLastFlow === null || minutesSinceLastFlow >= FLOW_COOLDOWN_MS / (60 * 1000);
  
  return {
    ambientStateOk,
    ambientState,
    momentumActive,
    momentumDurationMs,
    spamMultiplierOk,
    spamMultiplier,
    pauseOk,
    secondsSinceLastTask,
    cooldownOk,
    minutesSinceLastFlow,
  };
}

