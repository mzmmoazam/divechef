import React from 'react';
import { ScrollView, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDiveDetail } from '../hooks/useDives';
import { DepthProfileChart } from '../components/DepthProfileChart';
import { InsightCard } from '../components/InsightCard';
import type { RootStackProps } from '../navigation/types';

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function DiveDetailScreen({ route }: RootStackProps<'DiveDetail'>) {
  const { diveId } = route.params;
  const { t } = useTranslation();
  const { data, isLoading } = useDiveDetail(diveId);

  if (isLoading || !data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  const { dive, insights } = data;
  const date = new Date(dive.startedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const durationMin = Math.round(dive.durationSec / 60);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.metricsSection}>
        <MetricRow label={t('detail.date')} value={date} />
        <MetricRow label={t('detail.duration')} value={`${durationMin} min`} />
        <MetricRow label={t('detail.maxDepth')} value={`${dive.maxDepthM.toFixed(1)} m`} />
        <MetricRow label={t('detail.avgDepth')} value={`${dive.avgDepthM.toFixed(1)} m`} />
        {dive.minWaterTempC != null && (
          <MetricRow label={t('detail.temp')} value={`${dive.minWaterTempC.toFixed(1)} °C`} />
        )}
        <MetricRow
          label={t('detail.score')}
          value={
            dive.safetyScore != null
              ? t('detail.scoreValue', { score: dive.safetyScore })
              : '—'
          }
        />
      </View>

      <Text style={styles.sectionTitle}>{t('detail.depthProfile')}</Text>
      <DepthProfileChart diveId={diveId} />

      <Text style={styles.sectionTitle}>{t('detail.insights')}</Text>
      {insights.length === 0 ? (
        <Text style={styles.noInsights}>{t('detail.noInsights')}</Text>
      ) : (
        insights.map((insight) => <InsightCard key={insight.id} insight={insight} />)
      )}

      <Text style={styles.disclaimer}>{t('detail.disclaimer')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  content: { padding: 16, paddingBottom: 32 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  metricsSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  metricLabel: { fontSize: 14, color: '#666' },
  metricValue: { fontSize: 14, fontWeight: '600', color: '#111' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginTop: 16,
    marginBottom: 8,
  },
  noInsights: { fontSize: 14, color: '#666', fontStyle: 'italic', marginVertical: 8 },
  disclaimer: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 16,
  },
});
