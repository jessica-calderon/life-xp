import { generateImpactReflection, createImpactReflectionContext, ImpactReflectionContext } from './impactReflection';
import { Character, AmbientState } from '../types';

describe('generateImpactReflection', () => {
  describe('Rule 1: High recovery load', () => {
    it('should emphasize restraint when recovery load > 0.5', () => {
      const context: ImpactReflectionContext = {
        momentumActive: false,
        ambientState: 'NEUTRAL',
        pauseSinceLastTask: 0,
        recoveryLoad: 0.6,
        energyDelta: -2,
        focusDelta: -1,
      };
      
      const reflection = generateImpactReflection(context);
      expect(reflection).toBe('Consider your current capacity.');
    });

    it('should prioritize recovery load even with momentum and balanced state', () => {
      const context: ImpactReflectionContext = {
        momentumActive: true,
        ambientState: 'RESTED',
        pauseSinceLastTask: 0,
        recoveryLoad: 0.7,
        energyDelta: -2,
        focusDelta: -1,
      };
      
      const reflection = generateImpactReflection(context);
      expect(reflection).toBe('Consider your current capacity.');
    });
  });

  describe('Rule 2: Momentum + balanced', () => {
    it('should affirm intentional progress when momentum active and RESTED', () => {
      const context: ImpactReflectionContext = {
        momentumActive: true,
        ambientState: 'RESTED',
        pauseSinceLastTask: 0,
        recoveryLoad: 0.3,
        energyDelta: -2,
        focusDelta: -1,
      };
      
      const reflection = generateImpactReflection(context);
      expect(reflection).toBe('Progress made with intention.');
    });

    it('should affirm intentional progress when momentum active and CLEAR_HEADED', () => {
      const context: ImpactReflectionContext = {
        momentumActive: true,
        ambientState: 'CLEAR_HEADED',
        pauseSinceLastTask: 0,
        recoveryLoad: 0.2,
        energyDelta: -2,
        focusDelta: -1,
      };
      
      const reflection = generateImpactReflection(context);
      expect(reflection).toBe('Progress made with intention.');
    });
  });

  describe('Rule 3: Momentum + overextended', () => {
    it('should acknowledge effort with caution when momentum active and OVEREXTENDED', () => {
      const context: ImpactReflectionContext = {
        momentumActive: true,
        ambientState: 'OVEREXTENDED',
        pauseSinceLastTask: 0,
        recoveryLoad: 0.3,
        energyDelta: -2,
        focusDelta: -1,
      };
      
      const reflection = generateImpactReflection(context);
      expect(reflection).toBe('Effort noted, with awareness of limits.');
    });
  });

  describe('Rule 4: No momentum + long pause', () => {
    it('should acknowledge re-entry when no momentum and pause > 5 minutes', () => {
      const context: ImpactReflectionContext = {
        momentumActive: false,
        ambientState: 'NEUTRAL',
        pauseSinceLastTask: 6 * 60, // 6 minutes
        recoveryLoad: 0.2,
        energyDelta: -2,
        focusDelta: -1,
      };
      
      const reflection = generateImpactReflection(context);
      expect(reflection).toBe('Returning to the work.');
    });

    it('should not trigger re-entry when pause is exactly 5 minutes', () => {
      const context: ImpactReflectionContext = {
        momentumActive: false,
        ambientState: 'NEUTRAL',
        pauseSinceLastTask: 5 * 60, // exactly 5 minutes
        recoveryLoad: 0.2,
        energyDelta: -2,
        focusDelta: -1,
      };
      
      const reflection = generateImpactReflection(context);
      expect(reflection).toBe('Task completed.');
    });

    it('should not trigger re-entry when momentum is active even with long pause', () => {
      const context: ImpactReflectionContext = {
        momentumActive: true,
        ambientState: 'NEUTRAL',
        pauseSinceLastTask: 10 * 60, // 10 minutes
        recoveryLoad: 0.2,
        energyDelta: -2,
        focusDelta: -1,
      };
      
      const reflection = generateImpactReflection(context);
      // Should match Rule 2 or 3, or default, but not Rule 4
      expect(reflection).not.toBe('Returning to the work.');
    });
  });

  describe('Rule 5: Default neutral acknowledgment', () => {
    it('should return default message when no other rules match', () => {
      const context: ImpactReflectionContext = {
        momentumActive: false,
        ambientState: 'NEUTRAL',
        pauseSinceLastTask: 2 * 60, // 2 minutes (not long enough)
        recoveryLoad: 0.3, // not high enough
        energyDelta: -2,
        focusDelta: -1,
      };
      
      const reflection = generateImpactReflection(context);
      expect(reflection).toBe('Task completed.');
    });
  });

  describe('Output requirements', () => {
    it('should return a single short sentence', () => {
      const contexts: ImpactReflectionContext[] = [
        {
          momentumActive: true,
          ambientState: 'RESTED',
          pauseSinceLastTask: 0,
          recoveryLoad: 0.2,
          energyDelta: -2,
          focusDelta: -1,
        },
        {
          momentumActive: false,
          ambientState: 'OVEREXTENDED',
          pauseSinceLastTask: 10 * 60,
          recoveryLoad: 0.8,
          energyDelta: -2,
          focusDelta: -1,
        },
      ];

      contexts.forEach(context => {
        const reflection = generateImpactReflection(context);
        // Should be a single sentence (no periods except at the end, or one period total)
        const periodCount = (reflection.match(/\./g) || []).length;
        expect(periodCount).toBeLessThanOrEqual(1);
        // Should be relatively short (less than 60 characters)
        expect(reflection.length).toBeLessThan(60);
      });
    });

    it('should not contain praise words', () => {
      const praiseWords = ['great', 'awesome', 'excellent', 'amazing', 'fantastic', 'wonderful', 'perfect', 'outstanding'];
      const contexts: ImpactReflectionContext[] = [
        {
          momentumActive: true,
          ambientState: 'RESTED',
          pauseSinceLastTask: 0,
          recoveryLoad: 0.2,
          energyDelta: -2,
          focusDelta: -1,
        },
        {
          momentumActive: false,
          ambientState: 'NEUTRAL',
          pauseSinceLastTask: 10 * 60,
          recoveryLoad: 0.1,
          energyDelta: -2,
          focusDelta: -1,
        },
      ];

      contexts.forEach(context => {
        const reflection = generateImpactReflection(context).toLowerCase();
        praiseWords.forEach(word => {
          expect(reflection).not.toContain(word);
        });
      });
    });
  });
});

describe('createImpactReflectionContext', () => {
  const now = Date.now();

  it('should detect active momentum', () => {
    const character: Character = {
      level: 1,
      xp: 0,
      stats: { energy: 80, focus: 70, health: 90, mental: 75 },
      statusEffects: [
        {
          id: 'momentum-1234567890-abc',
          name: 'Momentum',
          type: 'buff',
          statModifiers: {},
          duration: 15 * 60 * 1000,
          expiresAt: now + 10 * 60 * 1000, // expires in 10 minutes
        },
      ],
      lastRegenerationTime: now,
      lastTaskCompletedAt: now - 1000,
      ambientState: 'RESTED',
    };

    const context = createImpactReflectionContext(character, now);
    expect(context.momentumActive).toBe(true);
  });

  it('should detect inactive momentum when expired', () => {
    const character: Character = {
      level: 1,
      xp: 0,
      stats: { energy: 80, focus: 70, health: 90, mental: 75 },
      statusEffects: [
        {
          id: 'momentum-1234567890-abc',
          name: 'Momentum',
          type: 'buff',
          statModifiers: {},
          duration: 15 * 60 * 1000,
          expiresAt: now - 1000, // expired
        },
      ],
      lastRegenerationTime: now,
      lastTaskCompletedAt: now - 1000,
      ambientState: 'RESTED',
    };

    const context = createImpactReflectionContext(character, now);
    expect(context.momentumActive).toBe(false);
  });

  it('should use ambient state from character', () => {
    const character: Character = {
      level: 1,
      xp: 0,
      stats: { energy: 80, focus: 70, health: 90, mental: 75 },
      statusEffects: [],
      lastRegenerationTime: now,
      lastTaskCompletedAt: now - 1000,
      ambientState: 'OVEREXTENDED',
    };

    const context = createImpactReflectionContext(character, now);
    expect(context.ambientState).toBe('OVEREXTENDED');
  });

  it('should default to NEUTRAL when ambient state is undefined', () => {
    const character: Character = {
      level: 1,
      xp: 0,
      stats: { energy: 80, focus: 70, health: 90, mental: 75 },
      statusEffects: [],
      lastRegenerationTime: now,
      lastTaskCompletedAt: now - 1000,
    };

    const context = createImpactReflectionContext(character, now);
    expect(context.ambientState).toBe('NEUTRAL');
  });

  it('should calculate pause since last task in seconds', () => {
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const character: Character = {
      level: 1,
      xp: 0,
      stats: { energy: 80, focus: 70, health: 90, mental: 75 },
      statusEffects: [],
      lastRegenerationTime: now,
      lastTaskCompletedAt: fiveMinutesAgo,
      ambientState: 'NEUTRAL',
    };

    const context = createImpactReflectionContext(character, now);
    expect(context.pauseSinceLastTask).toBe(5 * 60); // 5 minutes in seconds
  });

  it('should return 0 pause when lastTaskCompletedAt is null', () => {
    const character: Character = {
      level: 1,
      xp: 0,
      stats: { energy: 80, focus: 70, health: 90, mental: 75 },
      statusEffects: [],
      lastRegenerationTime: now,
      lastTaskCompletedAt: null,
      ambientState: 'NEUTRAL',
    };

    const context = createImpactReflectionContext(character, now);
    expect(context.pauseSinceLastTask).toBe(0);
  });

  it('should use default stat deltas when not provided', () => {
    const character: Character = {
      level: 1,
      xp: 0,
      stats: { energy: 80, focus: 70, health: 90, mental: 75 },
      statusEffects: [],
      lastRegenerationTime: now,
      lastTaskCompletedAt: now - 1000,
      ambientState: 'NEUTRAL',
    };

    const context = createImpactReflectionContext(character, now);
    expect(context.energyDelta).toBe(-2);
    expect(context.focusDelta).toBe(-1);
  });

  it('should use provided stat deltas', () => {
    const character: Character = {
      level: 1,
      xp: 0,
      stats: { energy: 80, focus: 70, health: 90, mental: 75 },
      statusEffects: [],
      lastRegenerationTime: now,
      lastTaskCompletedAt: now - 1000,
      ambientState: 'NEUTRAL',
    };

    const context = createImpactReflectionContext(character, now, -5, -3);
    expect(context.energyDelta).toBe(-5);
    expect(context.focusDelta).toBe(-3);
  });
});

