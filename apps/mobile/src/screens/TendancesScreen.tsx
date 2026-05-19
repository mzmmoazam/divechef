import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useTrends } from '../hooks/useTrends';
import { ScoreTrendChart } from '../components/ScoreTrendChart';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { tokens } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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
  const navigation = useNavigation<Nav>();
  const { data, isLoading } = useTrends(30);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="large" />
      </View>
    );
  }

  if (!data || data.diveCount === 0) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState
          icon="📈"
          title="No trends yet"
          body="Sync a few dives to see your score trend here."
          ctaLabel="Sync now"
          onCtaPress={() => navigation.navigate('Sync')}
        />
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

      <Card style={styles.tipCard}>
        <Text style={styles.tipText}>
          {t(`summaryTips.${data.summaryTipKey}`)}
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bgBase },
  content: { padding: tokens.space[4], paddingBottom: tokens.space[8] },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: tokens.color.bgBase },
  emptyContainer: { flex: 1, backgroundColor: tokens.color.bgBase },
  title: { fontSize: tokens.type.title.size, fontWeight: tokens.type.title.weight, color: tokens.color.text, marginBottom: tokens.space[1] },
  period: { fontSize: tokens.type.body.size, color: tokens.color.text2, marginBottom: tokens.space[4] },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tokens.space[4],
  },
  statCard: {
    flex: 1,
    backgroundColor: tokens.color.bgElev,
    borderRadius: tokens.radius.card,
    padding: tokens.space[3],
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.color.borderSubtle,
  },
  statValue: {
    fontSize: tokens.type.monoDigit.size,
    fontWeight: tokens.type.monoDigit.weight,
    color: tokens.color.accent,
    marginBottom: tokens.space[1],
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: tokens.type.caption.size,
    fontWeight: tokens.type.caption.weight,
    letterSpacing: tokens.type.caption.letterSpacing,
    color: tokens.color.text2,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: tokens.type.heading.size,
    fontWeight: tokens.type.heading.weight,
    color: tokens.color.text,
    marginTop: tokens.space[4],
    marginBottom: tokens.space[2],
  },
  tipCard: {
    marginTop: tokens.space[4],
  },
  tipText: { fontSize: tokens.type.body.size, color: tokens.color.text2, lineHeight: 22 },
});
