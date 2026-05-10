import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { DiveSummary } from '@diveforge/shared/types';

interface DiveListItemProps {
  dive: DiveSummary;
  onPress: () => void;
}

export function DiveListItem({ dive, onPress }: DiveListItemProps) {
  const { t } = useTranslation();

  const date = new Date(dive.startedAt);
  const formattedDate = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const durationMin = Math.round(dive.durationSec / 60);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.left}>
        <Text style={styles.date}>{formattedDate}</Text>
        <Text style={styles.details}>
          {t('home.depth', { depth: dive.maxDepthM.toFixed(1) })}
          {'  '}
          {t('home.duration', { duration: durationMin })}
        </Text>
      </View>
      <View style={styles.right}>
        {dive.safetyScore != null && (
          <Text style={styles.score}>
            {t('home.score', { score: dive.safetyScore })}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  left: { flex: 1 },
  date: { fontSize: 16, fontWeight: '500', color: '#111' },
  details: { fontSize: 13, color: '#666', marginTop: 4 },
  right: { marginLeft: 12 },
  score: { fontSize: 14, fontWeight: '600', color: '#0066cc' },
});
