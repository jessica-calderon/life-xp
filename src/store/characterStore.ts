import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { Character, Stats, StatusEffect } from '../types';
import { addXP, removeExpiredStatusEffects, clearLevelUpFlag, getTaskRewardMultiplier } from '../domain/character';
import { applyRegeneration } from '../domain/regeneration';
import { deriveAmbientState } from '../domain/ambientState';

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
    
    const finalCharacter: Character = {
      ...xpUpdated,
      stats: {
        ...xpUpdated.stats,
        energy: energyUpdated,
        focus: focusUpdated,
      },
    };
    
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

