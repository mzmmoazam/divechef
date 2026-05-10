import React from 'react';
import { ScrollView, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTrends } from '../hooks/useTrends';
import { ScoreTrendChart } from '../components/ScoreTrendChart';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function TendancesScreen() {
  const { t } = useTranslation();
  const { data, isLoading } = useTrends(30);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  if (!data || data.diveCount === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('trends.noData')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('trends.title')}</Text>
      <Text style={styles.period}>{t('trends.period')}</Text>

      <View style={styles.statsRow}>
        <StatCard
          label={t('trends.avgScore')}
          value={`${Math.round(data.avgScore)}/100`}
        />
        <StatCard
          label={t('trends.avgDepth')}
          value={`${data.avgDepthM.toFixed(1)} m`}
        />
        <StatCard
          label={t('trends.diveCount')}
          value={`${data.diveCount}`}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('trends.scoreTrend')}</Text>
      <ScoreTrendChart data={data.scoreSeries} />

      <View style={styles.tipContainer}>
        <Text style={styles.tipText}>
          {t(`summaryTips.${data.summaryTipKey}`)}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  content: { padding: 16, paddingBottom: 32 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#666', textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 4 },
  period: { fontSize: 14, color: '#666', marginBottom: 16 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  statValue: { fontSize: 18, fontWeight: '700', color: '#0066cc', marginBottom: 4 },
  statLabel: { fontSize: 11, color: '#666', textAlign: 'center' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginTop: 16,
    marginBottom: 8,
  },
  tipContainer: {
    backgroundColor: '#e8f4fd',
    borderRadius: 8,
    padding: 14,
    marginTop: 16,
  },
  tipText: { fontSize: 14, color: '#1a3e5c', lineHeight: 20 },
});
