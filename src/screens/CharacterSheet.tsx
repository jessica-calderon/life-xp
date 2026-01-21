import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  useColorScheme,
} from 'react-native';
import { useCharacterStore } from '../store/characterStore';
import { getEffectiveStats, getXPRequiredForLevel } from '../domain/character';
import { StatType } from '../types';

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
}

function StatBar({ label, value, maxValue, color, colors }: StatBarProps) {
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

  const { character, isInitialized, initialize, processRegeneration } = useCharacterStore();
  const effectiveStats = getEffectiveStats(character);
  const activeEffects = character.statusEffects.filter(
    (e) => e.expiresAt > Date.now()
  );

  // Initialize on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  // Process regeneration periodically
  useEffect(() => {
    if (!isInitialized) return;

    const interval = setInterval(() => {
      processRegeneration();
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [isInitialized, processRegeneration]);

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
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <View style={styles.levelHeader}>
          <Text style={[styles.levelText, { color: colors.text }]}>
            Level {character.level}
          </Text>
          <Text style={[styles.xpText, { color: colors.textSecondary }]}>
            {character.xp} / {xpRequired} XP
          </Text>
        </View>
        <View style={[styles.xpBarBackground, { backgroundColor: colors.xpBarBg }]}>
          <Animated.View
            style={[
              styles.xpBarFill,
              {
                backgroundColor: colors.xpBar,
                width: `${xpPercentage}%`,
              },
            ]}
          />
        </View>
      </View>

      {/* Stats Section */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Stats</Text>
        <StatBar
          label="Energy"
          value={effectiveStats.energy}
          maxValue={100}
          color={colors.energy}
          colors={colors}
        />
        <StatBar
          label="Focus"
          value={effectiveStats.focus}
          maxValue={100}
          color={colors.focus}
          colors={colors}
        />
        <StatBar
          label="Health"
          value={effectiveStats.health}
          maxValue={100}
          color={colors.health}
          colors={colors}
        />
        <StatBar
          label="Mental"
          value={effectiveStats.mental}
          maxValue={100}
          color={colors.mental}
          colors={colors}
        />
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
      </View>
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
  levelText: {
    fontSize: 24,
    fontWeight: '700',
  },
  xpText: {
    fontSize: 14,
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
});

