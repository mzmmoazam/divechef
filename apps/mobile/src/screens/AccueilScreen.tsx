import React, { useCallback, useMemo } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDiveList } from '../hooks/useDives';
import { LastDiveCard } from '../components/LastDiveCard';
import { DiveListItem } from '../components/DiveListItem';
import { QueueBanner } from '../components/QueueBanner';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { tokens } from '../theme';
import { api } from '../services/api';
import type { DiveSummary } from '@divechef/shared/types';
import type { RootStackParamList } from '../navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function AccueilScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const {
    data,
    isLoading,
    isRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDiveList();

  const allDives: DiveSummary[] = data?.pages.flatMap((p) => p.dives) ?? [];
  const lastDive = allDives[0] ?? null;

  const handleRefresh = useCallback(async () => {
    // Reprocess any unparsed dives, then refresh the list
    const hasUnparsed = allDives.some((d) => d.durationSec === 0 && d.maxDepthM === 0);
    if (hasUnparsed) {
      try { await api.post('/api/dives/reprocess'); } catch {}
    }
    refetch();
  }, [allDives, refetch]);

  const handleDivePress = useCallback(
    (diveId: string) => {
      navigation.navigate('DiveDetail', { diveId });
    },
    [navigation]
  );

  const handleSync = useCallback(() => {
    navigation.navigate('Sync');
  }, [navigation]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const ListHeader = useMemo(() => {
    return (
      <>
        <QueueBanner />
        {lastDive && (
          <LastDiveCard
            dive={lastDive}
            onPress={() => handleDivePress(lastDive.id)}
          />
        )}
      </>
    );
  }, [lastDive, handleDivePress]);

  const ListEmpty = useMemo(() => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon="🌊"
        title="No dives yet"
        body="Sync your dive computer to see your last dive here."
        ctaLabel="Sync now"
        onCtaPress={handleSync}
      />
    );
  }, [isLoading, handleSync]);

  const renderItem = ({ item, index }: { item: DiveSummary; index: number }) => {
    // Skip the first item if it's shown in the header card
    if (index === 0 && lastDive) return null;
    return (
      <DiveListItem
        dive={item}
        onPress={() => handleDivePress(item.id)}
      />
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={allDives}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
          />
        }
        contentContainerStyle={allDives.length === 0 ? styles.emptyContainer : undefined}
      />
      {allDives.length > 0 && (
        <Button
          label={t('home.syncButton')}
          variant="filled"
          onPress={handleSync}
          style={styles.fab}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bgBase },
  emptyContainer: { flexGrow: 1 },
  fab: {
    position: 'absolute',
    bottom: tokens.space[6],
    right: tokens.space[6],
  },
});
