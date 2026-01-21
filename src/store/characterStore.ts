import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { Character, Stats, StatusEffect } from '../types';
import { addXP, removeExpiredStatusEffects, clearLevelUpFlag } from '../domain/character';
import { applyRegeneration } from '../domain/regeneration';

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
};

interface CharacterStore {
  character: Character;
  isInitialized: boolean;
  
  // Actions
  initialize: () => Promise<void>;
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

  initialize: async () => {
    const stored = await get()._loadFromStorage();
    if (stored) {
      // Process regeneration and expired effects on load
      const now = Date.now();
      let character = applyRegeneration(stored, now);
      character = removeExpiredStatusEffects(character);
      // Clear level-up flag on load (it's a session flag)
      character.justLeveledUp = undefined;
      
      set({ character, isInitialized: true });
      await get()._saveToStorage();
    } else {
      set({ character: DEFAULT_CHARACTER, isInitialized: true });
      await get()._saveToStorage();
    }
  },

  gainXP: (amount: number) => {
    const updated = addXP(get().character, amount);
    set({ character: updated });
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
    };
    set({ character: resetCharacter });
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

