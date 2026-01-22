import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useCharacterStore, getFlowDebugInfo } from '../store/characterStore';
import { getRecoveryDebt } from '../domain/recoveryDebt';
import { deriveNarrativeReflection, getNarrativeReflectionRule } from '../domain/narrativeReflection';

interface FlowInspectorDevProps {
  colors: Record<string, string> & {
    surface: string;
    text: string;
    textSecondary: string;
  };
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format minutes to human-readable string
 */
function formatMinutes(minutes: number): string {
  return `${minutes}m`;
}

/**
 * Format seconds to human-readable string
 */
function formatSeconds(seconds: number): string {
  return `${seconds}s`;
}

/**
 * Format multiplier to 2 decimal places
 */
function formatMultiplier(multiplier: number): string {
  return multiplier.toFixed(2);
}

/**
 * Get qualitative description of recovery debt
 * Dev-only: Shows descriptive text, not numbers
 */
function getRecoveryDebtDescription(debt: number): string {
  if (debt < 0.2) {
    return 'Minimal';
  } else if (debt < 0.4) {
    return 'Low';
  } else if (debt < 0.6) {
    return 'Moderate';
  } else if (debt < 0.8) {
    return 'Elevated';
  } else {
    return 'High';
  }
}

export default function FlowInspectorDev({ colors }: FlowInspectorDevProps) {
  // DEV-ONLY: Never render in production
  if (!__DEV__) {
    return null;
  }

  const store = useCharacterStore();
  const now = Date.now();
  const debugInfo = getFlowDebugInfo(store, now);
  const recoveryDebt = getRecoveryDebt(store.character);
  const recoveryDebtDescription = getRecoveryDebtDescription(recoveryDebt);
  const reflection = deriveNarrativeReflection(store.character, now);
  const reflectionRule = getNarrativeReflectionRule(store.character, now);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.text }]}>Flow (Debug)</Text>
      
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {debugInfo.ambientStateOk ? '✓' : '✗'} Ambient State:
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {debugInfo.ambientState}
        </Text>
      </View>

      <View style={styles.separator} />

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {debugInfo.momentumActive ? '✓' : '✗'} Momentum:
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {debugInfo.momentumActive ? formatDuration(debugInfo.momentumDurationMs) : 'Inactive'}
        </Text>
      </View>

      <View style={styles.separator} />

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {debugInfo.spamMultiplierOk ? '✓' : '✗'} Spam Multiplier:
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {formatMultiplier(debugInfo.spamMultiplier)}
        </Text>
      </View>

      <View style={styles.separator} />

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {debugInfo.pauseOk ? '✓' : '✗'} Pause Since Last Task:
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {formatSeconds(debugInfo.secondsSinceLastTask)}
        </Text>
      </View>

      <View style={styles.separator} />

      <View style={styles.separator} />

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {debugInfo.cooldownOk ? '✓' : '✗'} Cooldown Since Flow:
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {debugInfo.minutesSinceLastFlow === null 
            ? 'Never' 
            : formatMinutes(debugInfo.minutesSinceLastFlow)}
        </Text>
      </View>

      <View style={styles.separator} />

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Recovery Load:
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {recoveryDebtDescription}
        </Text>
      </View>

      <View style={styles.separator} />

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Reflection:
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {reflection || '(none)'}
        </Text>
      </View>

      <View style={styles.separator} />

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Reflection Rule:
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {reflectionRule}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  value: {
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    marginVertical: 6,
  },
});

