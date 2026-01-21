export type StatType = 'energy' | 'focus' | 'health' | 'mental';

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
}

