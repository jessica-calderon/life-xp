import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  useColorScheme,
  TouchableOpacity,
  AccessibilityInfo,
  AppState,
} from 'react-native';
import { useCharacterStore } from '../store/characterStore';
import { getEffectiveStats, getXPRequiredForLevel } from '../domain/character';
import { deriveNarrativeReflection } from '../domain/narrativeReflection';
import { generateImpactReflection, createImpactReflectionContext, createTaskEffortContext, getTaskEffortTier } from '../domain/impactReflection';
import { getIdentityReflection, createIdentityReflectionContext, getIdentityReflectionRule } from '../domain/identityReflection';
import { StatType, AmbientState } from '../types';
import FlowInspectorDev from './FlowInspectorDev';

const COLORS = {
  dark: {
    background: '#0a0a0a',
    surface: '#1a1a1a',
    text: '#e0e0e0',
    textSecondary: '#a0a0a0',
    accent: '#4a9eff',
    energy: '#4ade80',
    focus: '#a78bfa',
    health: '#f87171',
    mental: '#60a5fa',
    buff: '#22c55e',
    debuff: '#ef4444',
    xpBar: '#3b82f6',
    xpBarBg: '#1e293b',
  },
  light: {
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#1a1a1a',
    textSecondary: '#666666',
    accent: '#2563eb',
    energy: '#16a34a',
    focus: '#9333ea',
    health: '#dc2626',
    mental: '#2563eb',
    buff: '#16a34a',
    debuff: '#dc2626',
    xpBar: '#2563eb',
    xpBarBg: '#e5e7eb',
  },
};

interface StatBarProps {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  colors: typeof COLORS.dark;
  hasGlow?: boolean;
}

/**
 * Get description text for ambient state
 */
function getAmbientStateDescription(state: AmbientState): string {
  switch (state) {
    case 'RESTED':
      return 'You feel rested.';
    case 'CLEAR_HEADED':
      return 'Your mind feels clear.';
    case 'OVEREXTENDED':
      return 'You feel overextended.';
    default:
      return '';
  }
}

/**
 * Get accent color for ambient state (for thin accent bar)
 */
function getAmbientStateColor(
  state: AmbientState,
  colors: typeof COLORS.dark
): string {
  switch (state) {
    case 'RESTED':
      return colors.energy;
    case 'CLEAR_HEADED':
      return colors.focus;
    case 'OVEREXTENDED':
      return colors.debuff;
    default:
      return colors.textSecondary;
  }
}

function StatBar({ label, value, maxValue, color, colors, hasGlow = false }: StatBarProps) {
  const animatedWidth = useRef(new Animated.Value(value / maxValue)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: value / maxValue,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [value, maxValue, animatedWidth]);

  const percentage = Math.round((value / maxValue) * 100);

  return (
    <View style={styles.statBarContainer}>
      <View style={styles.statBarHeader}>
        <Text style={[styles.statLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.statValue, { color: colors.textSecondary }]}>
          {Math.round(value)}/{maxValue}
        </Text>
      </View>
      <View style={[styles.statBarBackground, { backgroundColor: colors.xpBarBg }]}>
        <Animated.View
          style={[
            styles.statBarFill,
            {
              backgroundColor: color,
              width: animatedWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
              opacity: hasGlow ? 0.9 : 1.0,
              boxShadow: hasGlow ? `0px 0px 4px ${color}40` : 'none',
            },
          ]}
        />
      </View>
    </View>
  );
}

export default function CharacterSheet() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? COLORS.dark : COLORS.light;

  const { character, isInitialized, initialize, processRegeneration, resetCharacter, completeTask, clearLevelUpFlag, jumpTimeBy } = useCharacterStore();
  const effectiveStats = getEffectiveStats(character);
  const activeEffects = character.statusEffects.filter(
    (e) => e.expiresAt > Date.now()
  );
  const reflection = deriveNarrativeReflection(character, Date.now());
  
  // Calculate identity reflection
  const now = Date.now();
  const identityContext = createIdentityReflectionContext(character, now);
  const identityReflection = getIdentityReflection(identityContext);
  const identityReflectionRule = __DEV__ ? getIdentityReflectionRule(identityContext) : null;

  // Safe stats normalization - ensures all stats are always defined
  const safeStats = {
    energy: effectiveStats?.energy ?? 0,
    focus: effectiveStats?.focus ?? 0,
    health: effectiveStats?.health ?? 0,
    mental: effectiveStats?.mental ?? 0,
  };

  // Level-up animation refs
  // Native driver values (opacity, scale, transform)
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const levelUpTextOpacity = useRef(new Animated.Value(0)).current;
  const levelTextOpacity = useRef(new Animated.Value(1)).current;
  const levelCardScale = useRef(new Animated.Value(0)).current;
  
  // JS driver values (color, shadow, width)
  const xpBarColorAnim = useRef(new Animated.Value(0)).current;
  const levelCardShadow = useRef(new Animated.Value(0)).current;
  const xpBarWidth = useRef(new Animated.Value(0)).current;
  const reducedMotion = useRef(false);
  const levelUpAnimatingRef = useRef(false);
  
  // Micro-copy messages for level-up feedback
  const microCopyMessages = [
    "You feel more capable.",
    "Your baseline has improved.",
    "A quiet shift in perspective.",
    "Subtle growth, noticed.",
  ];
  const [currentMicroCopyIndex, setCurrentMicroCopyIndex] = React.useState(0);

  // Impact reflection state
  const [impactReflection, setImpactReflection] = React.useState<string | null>(null);
  const impactReflectionOpacity = useRef(new Animated.Value(0)).current;

  // Check for reduced motion preference
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((isEnabled) => {
      reducedMotion.current = isEnabled;
    });
  }, []);

  // Handle level-up animation
  useEffect(() => {
    if (character.justLeveledUp && !levelUpAnimatingRef.current) {
      levelUpAnimatingRef.current = true;
      const totalDuration = reducedMotion.current ? 0 : 1500; // 1.5 seconds total
      const fadeInDuration = reducedMotion.current ? 0 : 300;
      const holdDuration = reducedMotion.current ? 0 : 800; // Hold at peak
      const fadeOutDuration = reducedMotion.current ? 0 : 400;

      // Rotate micro-copy message
      setCurrentMicroCopyIndex((prev) => (prev + 1) % microCopyMessages.length);

      // Stop all in-flight animations before starting new ones
      glowOpacity.stopAnimation();
      levelUpTextOpacity.stopAnimation();
      levelTextOpacity.stopAnimation();
      levelCardScale.stopAnimation();
      xpBarColorAnim.stopAnimation();
      levelCardShadow.stopAnimation();

      // Start animations
      Animated.parallel([
        // Glow pulse around level text
        Animated.sequence([
          Animated.timing(glowOpacity, {
            toValue: 1,
            duration: fadeInDuration,
            useNativeDriver: true,
            easing: Easing.out(Easing.ease),
          }),
          Animated.delay(holdDuration),
          Animated.timing(glowOpacity, {
            toValue: 0,
            duration: fadeOutDuration,
            useNativeDriver: true,
            easing: Easing.out(Easing.ease),
          }),
        ]),
        // Micro-copy text (subtle feedback)
        Animated.sequence([
          Animated.timing(levelUpTextOpacity, {
            toValue: 1,
            duration: fadeInDuration,
            useNativeDriver: true,
            easing: Easing.out(Easing.ease),
          }),
          Animated.delay(holdDuration),
          Animated.timing(levelUpTextOpacity, {
            toValue: 0,
            duration: fadeOutDuration,
            useNativeDriver: true,
            easing: Easing.out(Easing.ease),
          }),
        ]),
        // XP bar color shift
        Animated.sequence([
          Animated.timing(xpBarColorAnim, {
            toValue: 1,
            duration: fadeInDuration,
            useNativeDriver: false,
            easing: Easing.out(Easing.ease),
          }),
          Animated.delay(holdDuration),
          Animated.timing(xpBarColorAnim, {
            toValue: 0,
            duration: fadeOutDuration,
            useNativeDriver: false,
            easing: Easing.out(Easing.ease),
          }),
        ]),
        // Level card scale/shadow
        Animated.parallel([
          // Scale transform (native driver)
          Animated.sequence([
            Animated.timing(levelCardScale, {
              toValue: 1,
              duration: fadeInDuration,
              useNativeDriver: true,
              easing: Easing.out(Easing.ease),
            }),
            Animated.delay(holdDuration),
            Animated.timing(levelCardScale, {
              toValue: 0,
              duration: fadeOutDuration,
              useNativeDriver: true,
              easing: Easing.out(Easing.ease),
            }),
          ]),
          // Shadow properties (JS driver)
          Animated.sequence([
            Animated.timing(levelCardShadow, {
              toValue: 1,
              duration: fadeInDuration,
              useNativeDriver: false,
              easing: Easing.out(Easing.ease),
            }),
            Animated.delay(holdDuration),
            Animated.timing(levelCardShadow, {
              toValue: 0,
              duration: fadeOutDuration,
              useNativeDriver: false,
              easing: Easing.out(Easing.ease),
            }),
          ]),
        ]),
        // Level text subtle transition
        Animated.sequence([
          Animated.timing(levelTextOpacity, {
            toValue: 0.6,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(levelTextOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.out(Easing.ease),
          }),
        ]),
      ]).start(() => {
        // Release the lock and clear the flag after animation completes
        levelUpAnimatingRef.current = false;
        clearLevelUpFlag();
      });
    } else {
      // Reset animations when flag is cleared
      glowOpacity.setValue(0);
      levelUpTextOpacity.setValue(0);
      levelTextOpacity.setValue(1);
      levelCardScale.setValue(0);
      xpBarColorAnim.setValue(0);
      levelCardShadow.setValue(0);
    }
  }, [character.justLeveledUp, clearLevelUpFlag]);

  // Initialize on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  // Initialize XP bar width on mount or when character changes
  useEffect(() => {
    if (isInitialized) {
      const xpRequired = getXPRequiredForLevel(character.level + 1);
      const xpProgress = character.xp / xpRequired;
      xpBarWidth.setValue(xpProgress);
    }
  }, [isInitialized, character.level, character.xp, xpBarWidth]);

  // Process regeneration periodically
  useEffect(() => {
    if (!isInitialized) return;

    const interval = setInterval(() => {
      processRegeneration();
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [isInitialized, processRegeneration]);

  // Handle app resume/foreground - recalculate ambient state
  useEffect(() => {
    if (!isInitialized) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // App came to foreground - process regeneration and recalculate ambient state
        processRegeneration();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isInitialized, processRegeneration]);

  // Animate XP bar width smoothly
  // This must be declared before any early returns to maintain hook order
  useEffect(() => {
    if (!isInitialized) return;
    
    const xpRequired = getXPRequiredForLevel(character.level + 1);
    const xpProgress = character.xp / xpRequired;
    
    // Calculate animation duration based on multiplier
    // When multiplier < 1, slow down the animation slightly for subtle feedback
    const multiplier = character.taskSpamMultiplier ?? 1.0;
    const baseDuration = 600;
    // Scale duration inversely with multiplier (lower multiplier = slower animation)
    // Range: 600ms (multiplier 1.0) to 900ms (multiplier 0.2)
    let duration = baseDuration + (1.0 - multiplier) * 300;
    
    // Slightly smoother XP animation for CLEAR_HEADED state
    const isClearHeaded = character.ambientState === 'CLEAR_HEADED';
    const easing = isClearHeaded 
      ? Easing.out(Easing.cubic) // Smoother easing for CLEAR_HEADED
      : Easing.out(Easing.ease);
    
    xpBarWidth.stopAnimation();
    Animated.timing(xpBarWidth, {
      toValue: xpProgress,
      duration: duration,
      useNativeDriver: false,
      easing: easing,
    }).start();
  }, [isInitialized, character.xp, character.level, character.taskSpamMultiplier, xpBarWidth]);

  // Task completion handler (atomic, guarded in store)
  const handleTaskComplete = () => {
    // Complete the task first (updates store synchronously)
    completeTask();
    
    // Generate impact reflection after task completion using updated state
    // Access the store directly to get the updated character
    const store = useCharacterStore.getState();
    const now = Date.now();
    const context = createImpactReflectionContext(store.character, now, -2, -1);
    // Calculate effort tier for subtle reflection variation (based on current state)
    const effortContext = createTaskEffortContext(store.character, now);
    const effortTier = getTaskEffortTier(effortContext);
    const reflection = generateImpactReflection({ ...context, effortTier });
    
    // Show the reflection
    setImpactReflection(reflection);
    impactReflectionOpacity.setValue(1);
    
    // Auto-fade after 6-8 seconds (randomized between 6-8)
    const fadeDelay = 6000 + Math.random() * 2000; // 6000-8000ms
    setTimeout(() => {
      Animated.timing(impactReflectionOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: false,
        easing: Easing.out(Easing.ease),
      }).start(() => {
        setImpactReflection(null);
      });
    }, fadeDelay);
  };

  if (!isInitialized) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.text }]}>Loading...</Text>
      </View>
    );
  }

  const xpRequired = getXPRequiredForLevel(character.level + 1);
  const xpProgress = character.xp / xpRequired;
  const xpPercentage = Math.round(xpProgress * 100);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Level and XP Section */}
      <Animated.View
        style={[
          styles.section,
          {
            backgroundColor: colors.surface,
            transform: [
              {
                scale: levelCardScale.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.02],
                }),
              },
            ],
            boxShadow: levelCardShadow.interpolate({
              inputRange: [0, 1],
              outputRange: [
                '0px 2px 0px 0px rgba(0, 0, 0, 0)',
                isDark
                  ? '0px 2px 8px 0px rgba(74, 158, 255, 0.3)'
                  : '0px 2px 8px 0px rgba(37, 99, 235, 0.15)',
              ],
            }),
            elevation: levelCardShadow.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 4],
            }),
          },
        ]}
      >
        <View style={styles.levelHeader}>
          <View style={styles.levelContainer}>
            <Animated.View
              style={[
                styles.levelGlow,
                {
                  opacity: glowOpacity,
                  backgroundColor: isDark ? 'rgba(74, 158, 255, 0.15)' : 'rgba(37, 99, 235, 0.12)',
                },
              ]}
            />
            <Animated.Text
              style={[
                styles.levelText,
                {
                  color: colors.text,
                  opacity: levelTextOpacity,
                },
              ]}
            >
              Level {character.level}
            </Animated.Text>
          </View>
          <Text style={[styles.xpText, { color: colors.textSecondary }]}>
            {character.xp} / {xpRequired} XP
          </Text>
        </View>
        <Animated.View
          style={[
            styles.levelUpTextContainer,
            {
              opacity: levelUpTextOpacity,
            },
          ]}
        >
          <Text style={[styles.levelUpText, { color: colors.textSecondary }]}>
            {microCopyMessages[currentMicroCopyIndex]}
          </Text>
        </Animated.View>
        <View style={[styles.xpBarBackground, { backgroundColor: colors.xpBarBg }]}>
          <Animated.View
            style={[
              styles.xpBarFill,
              {
                backgroundColor: xpBarColorAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    colors.xpBar,
                    isDark ? '#5ba3ff' : '#3b82f6', // Slightly brighter on level up
                  ],
                }),
                width: xpBarWidth.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </Animated.View>

      {/* Stats Section */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Stats</Text>
        <StatBar
          label="Energy"
          value={safeStats.energy}
          maxValue={100}
          color={colors.energy}
          colors={colors}
          hasGlow={character.ambientState === 'RESTED'}
        />
        <StatBar
          label="Focus"
          value={safeStats.focus}
          maxValue={100}
          color={colors.focus}
          colors={colors}
        />
        <StatBar
          label="Health"
          value={safeStats.health}
          maxValue={100}
          color={colors.health}
          colors={colors}
        />
        <StatBar
          label="Mental"
          value={safeStats.mental}
          maxValue={100}
          color={colors.mental}
          colors={colors}
        />
      </View>

      {/* Identity Reflection */}
      {identityReflection && (
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.identityReflectionText, { color: colors.textSecondary }]}>
            {identityReflection}
          </Text>
          {identityReflectionRule && identityReflectionRule !== 'None' && (
            <Text style={[styles.identityReflectionDebug, { color: colors.textSecondary }]}>
              [{identityReflectionRule}]
            </Text>
          )}
        </View>
      )}

      {/* Task Completion Button */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.taskButton, { borderColor: colors.textSecondary }]}
          onPress={handleTaskComplete}
          activeOpacity={0.85}
        >
          <Text style={[styles.taskButtonText, { color: colors.text }]}>
            Completed a task
          </Text>
        </TouchableOpacity>
        {impactReflection && (
          <Animated.Text
            style={[
              styles.impactReflectionText,
              {
                color: colors.textSecondary,
                opacity: impactReflectionOpacity,
              },
            ]}
          >
            {impactReflection}
          </Animated.Text>
        )}
      </View>

      {/* Status Effects Section */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Status Effects
        </Text>
        {activeEffects.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No active effects
          </Text>
        ) : (
          activeEffects.map((effect) => {
            const timeRemaining = Math.max(0, effect.expiresAt - Date.now());
            const minutesRemaining = Math.floor(timeRemaining / 60000);
            const secondsRemaining = Math.floor((timeRemaining % 60000) / 1000);

            return (
              <View
                key={effect.id}
                style={[
                  styles.effectCard,
                  {
                    backgroundColor: colors.background,
                    borderLeftColor:
                      effect.type === 'buff' ? colors.buff : colors.debuff,
                  },
                ]}
              >
                <View style={styles.effectHeader}>
                  <Text
                    style={[
                      styles.effectName,
                      { color: colors.text },
                    ]}
                  >
                    {effect.name}
                  </Text>
                  <Text
                    style={[
                      styles.effectType,
                      {
                        color:
                          effect.type === 'buff' ? colors.buff : colors.debuff,
                      },
                    ]}
                  >
                    {effect.type === 'buff' ? '+' : '-'}
                  </Text>
                </View>
                {effect.description && (
                  <Text
                    style={[styles.effectDescription, { color: colors.textSecondary }]}
                  >
                    {effect.description}
                  </Text>
                )}
                <View style={styles.effectModifiers}>
                  {Object.entries(effect.statModifiers).map(([stat, modifier]) => {
                    if (!modifier) return null;
                    const statColors: Record<string, string> = {
                      energy: colors.energy,
                      focus: colors.focus,
                      health: colors.health,
                      mental: colors.mental,
                    };
                    return (
                      <View key={stat} style={styles.modifierTag}>
                        <Text
                          style={[
                            styles.modifierText,
                            { color: statColors[stat] || colors.text },
                          ]}
                        >
                          {stat}: {modifier > 0 ? '+' : ''}{modifier}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <Text
                  style={[styles.effectTimer, { color: colors.textSecondary }]}
                >
                  {minutesRemaining}m {secondsRemaining}s remaining
                </Text>
              </View>
            );
          })
        )}
        {/* Ambient State Card */}
        {character.ambientState && character.ambientState !== 'NEUTRAL' && (
          <View
            style={[
              styles.ambientStateCard,
              {
                backgroundColor: colors.background,
                borderLeftColor: getAmbientStateColor(character.ambientState, colors),
              },
            ]}
          >
            <Text
              style={[styles.ambientStateText, { color: colors.textSecondary }]}
            >
              {getAmbientStateDescription(character.ambientState)}
            </Text>
          </View>
        )}
        {/* Narrative Reflection */}
        {reflection && (
          <Text style={[styles.reflectionText, { color: colors.textSecondary }]}>
            {reflection}
          </Text>
        )}
      </View>

      {/* Dev Menu */}
      {__DEV__ && (
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.devSectionTitle, { color: colors.textSecondary }]}>
            Dev Tools
          </Text>
          
          {/* Time Jump */}
          <View style={styles.devSubsection}>
            <Text style={[styles.devLabel, { color: colors.textSecondary }]}>
              Time Jump:
            </Text>
            <View style={styles.devButtonRow}>
              <TouchableOpacity
                style={[styles.devTimeButton, { borderColor: colors.textSecondary }]}
                onPress={() => jumpTimeBy(10 * 60 * 1000)}
              >
                <Text style={[styles.devTimeButtonText, { color: colors.textSecondary }]}>
                  +10m
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devTimeButton, { borderColor: colors.textSecondary }]}
                onPress={() => jumpTimeBy(60 * 60 * 1000)}
              >
                <Text style={[styles.devTimeButtonText, { color: colors.textSecondary }]}>
                  +1h
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devTimeButton, { borderColor: colors.textSecondary }]}
                onPress={() => jumpTimeBy(6 * 60 * 60 * 1000)}
              >
                <Text style={[styles.devTimeButtonText, { color: colors.textSecondary }]}>
                  +6h
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devTimeButton, { borderColor: colors.textSecondary }]}
                onPress={() => jumpTimeBy(24 * 60 * 60 * 1000)}
              >
                <Text style={[styles.devTimeButtonText, { color: colors.textSecondary }]}>
                  +1d
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devTimeButton, { borderColor: colors.textSecondary }]}
                onPress={() => jumpTimeBy(3 * 24 * 60 * 60 * 1000)}
              >
                <Text style={[styles.devTimeButtonText, { color: colors.textSecondary }]}>
                  +3d
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Reset Button */}
          <TouchableOpacity
            style={[styles.devResetButton, { borderColor: colors.textSecondary }]}
            onPress={async () => {
              await resetCharacter();
            }}
          >
            <Text style={[styles.devResetText, { color: colors.textSecondary }]}>
              Reset Character
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Flow Debug Panel */}
      {__DEV__ && <FlowInspectorDev colors={colors} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  levelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  levelContainer: {
    position: 'relative',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
  },
  levelText: {
    fontSize: 24,
    fontWeight: '700',
    position: 'relative',
    zIndex: 1,
  },
  xpText: {
    fontSize: 14,
  },
  levelUpTextContainer: {
    marginTop: -8,
    marginBottom: 8,
    height: 20,
    justifyContent: 'center',
  },
  levelUpText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  xpBarBackground: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  statBarContainer: {
    marginBottom: 16,
  },
  statBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  statValue: {
    fontSize: 12,
  },
  statBarBackground: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  statBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  effectCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  effectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  effectName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  effectType: {
    fontSize: 18,
    fontWeight: '700',
  },
  effectDescription: {
    fontSize: 12,
    marginBottom: 8,
    marginTop: 4,
  },
  effectModifiers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  modifierTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  modifierText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  effectTimer: {
    fontSize: 11,
    marginTop: 4,
  },
  ambientStateCard: {
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderLeftWidth: 3,
  },
  ambientStateText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  reflectionText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 12,
    opacity: 0.7,
  },
  devSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  devSubsection: {
    marginBottom: 12,
  },
  devLabel: {
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '500',
  },
  devButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  devTimeButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devTimeButtonText: {
    fontSize: 11,
    fontWeight: '500',
  },
  devResetButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  devResetText: {
    fontSize: 12,
    fontWeight: '500',
  },
  taskButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  taskButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  impactReflectionText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.7,
  },
  identityReflectionText: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    opacity: 0.6,
    lineHeight: 20,
  },
  identityReflectionDebug: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
    opacity: 0.4,
    fontFamily: 'monospace',
  },
});

