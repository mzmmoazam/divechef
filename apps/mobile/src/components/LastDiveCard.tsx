import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { DiveSummary } from '@diveforge/shared/types';

interface LastDiveCardProps {
  dive: DiveSummary;
  onPress: () => void;
}

export function LastDiveCard({ dive, onPress }: LastDiveCardProps) {
  const { t } = useTranslation();

  const date = new Date(dive.startedAt);
  const formattedDate = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const durationMin = Math.round(dive.durationSec / 60);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <Text style={styles.header}>{t('home.lastDive')}</Text>
      <Text style={styles.date}>{formattedDate}</Text>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {dive.maxDepthM.toFixed(1)}
          </Text>
          <Text style={styles.statLabel}>m</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{durationMin}</Text>
          <Text style={styles.statLabel}>min</Text>
        </View>
        {dive.safetyScore != null && (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{dive.safetyScore}</Text>
            <Text style={styles.statLabel}>/100</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0066cc',
    borderRadius: 12,
    padding: 20,
    margin: 16,
  },
  header: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  date: { fontSize: 16, color: '#fff', fontWeight: '600', marginTop: 4 },
  stats: { flexDirection: 'row', marginTop: 16, gap: 24 },
  stat: { flexDirection: 'row', alignItems: 'baseline' },
  statValue: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  statLabel: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginLeft: 2 },
});
