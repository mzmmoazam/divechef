import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Insight, Severity } from '@divechef/shared/types';

interface InsightCardProps {
  insight: Insight;
}

const SEVERITY_COLORS: Record<Severity, string> = {
  info: '#4caf50',
  warn: '#ff9800',
  alert: '#f44336',
};

export function InsightCard({ insight }: InsightCardProps) {
  const { t } = useTranslation();
  const borderColor = SEVERITY_COLORS[insight.severity];

  return (
    <View style={[styles.card, { borderLeftColor: borderColor }]}>
      <Text style={styles.title}>
        {t(`insights.${insight.ruleId}.title`)}
      </Text>
      <Text style={styles.body}>
        {t(`insights.${insight.ruleId}.body`, insight.evidence as Record<string, string>)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  title: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 4 },
  body: { fontSize: 13, color: '#444', lineHeight: 18 },
});
