export type StatType = 'energy' | 'focus' | 'health' | 'mental';

export type AmbientState = 'RESTED' | 'CLEAR_HEADED' | 'OVEREXTENDED' | 'NEUTRAL';

export interface Stats {
  energy: number;
  focus: number;
  health: number;
  mental: number;
}

export interface StatusEffect {
  id: string;
  name: string;
  type: 'buff' | 'debuff';
  statModifiers: Partial<Stats>;
  regenerationModifiers?: Partial<Stats>; // modifiers to regeneration rates
  duration: number; // in milliseconds
  expiresAt: number; // timestamp
  description?: string;
}

export interface Character {
  level: number;
  xp: number;
  stats: Stats;
  statusEffects: StatusEffect[];
  lastRegenerationTime: number; // timestamp
  justLeveledUp?: boolean; // lightweight level-up state flag
  lastTaskTimestamps?: number[]; // timestamps of recent task completions (for Momentum)
  lastTaskCompletedAt?: number | null; // timestamp of last task completion (for spam prevention)
  taskSpamMultiplier?: number; // multiplier for XP/stat rewards (default 1.0)
  ambientState?: AmbientState; // current ambient recovery state
}

