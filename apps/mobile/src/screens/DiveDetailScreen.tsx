import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDiveDetail } from '../hooks/useDives';
import { DepthProfileChart } from '../components/DepthProfileChart';
import { InsightCard } from '../components/InsightCard';
import { Card } from '../components/ui/Card';
import { ScoreNumber } from '../components/ui/ScoreNumber';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { tokens } from '../theme';
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
  const { data, isLoading, isError, refetch } = useDiveDetail(diveId);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="large" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.loadingContainer}>
        <EmptyState
          icon="⚠️"
          title={t('detail.errorTitle')}
          body={t('detail.errorBody')}
          ctaLabel={t('common.retry')}
          onCtaPress={() => refetch()}
        />
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
      {dive.safetyScore != null && (
        <Card hero style={{ marginBottom: tokens.space[4] }}>
          <Text style={styles.scorecardLabel}>{t('detail.score')}</Text>
          <ScoreNumber value={dive.safetyScore} size={tokens.type.display.size} />
        </Card>
      )}

      <Card style={{ marginBottom: tokens.space[4] }}>
        <MetricRow label={t('detail.date')} value={date} />
        <MetricRow label={t('detail.duration')} value={`${durationMin} min`} />
        <MetricRow label={t('detail.maxDepth')} value={`${dive.maxDepthM.toFixed(1)} m`} />
        <MetricRow label={t('detail.avgDepth')} value={`${dive.avgDepthM.toFixed(1)} m`} />
        {dive.minWaterTempC != null && (
          <MetricRow label={t('detail.temp')} value={`${dive.minWaterTempC.toFixed(1)} °C`} />
        )}
      </Card>

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
  container: { flex: 1, backgroundColor: tokens.color.bgBase },
  content: { padding: tokens.space[4], paddingBottom: tokens.space[8] },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: tokens.color.bgBase },
  scorecardLabel: {
    fontSize: tokens.type.caption.size,
    fontWeight: tokens.type.caption.weight,
    letterSpacing: tokens.type.caption.letterSpacing,
    color: tokens.color.text2,
    textTransform: 'uppercase',
    marginBottom: tokens.space[2],
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.space[2],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.borderSubtle,
  },
  metricLabel: {
    fontSize: tokens.type.caption.size,
    fontWeight: tokens.type.caption.weight,
    letterSpacing: tokens.type.caption.letterSpacing,
    color: tokens.color.text2,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: tokens.type.monoDigit.size,
    fontWeight: tokens.type.monoDigit.weight,
    fontVariant: ['tabular-nums'],
    color: tokens.color.text,
    letterSpacing: tokens.type.monoDigit.letterSpacing,
  },
  sectionTitle: {
    fontSize: tokens.type.heading.size,
    fontWeight: tokens.type.heading.weight,
    color: tokens.color.text,
    marginTop: tokens.space[4],
    marginBottom: tokens.space[2],
  },
  noInsights: {
    fontSize: tokens.type.body.size,
    color: tokens.color.text2,
    fontStyle: 'italic',
    marginVertical: tokens.space[2],
  },
  disclaimer: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.text3,
    textAlign: 'center',
    marginTop: tokens.space[6],
    lineHeight: 16,
  },
});
