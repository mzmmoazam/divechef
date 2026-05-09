import React, { useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDiveList } from '../hooks/useDives';
import { LastDiveCard } from '../components/LastDiveCard';
import { DiveListItem } from '../components/DiveListItem';
import type { DiveSummary } from '@diveforge/shared/types';
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
    if (!lastDive) return null;
    return (
      <LastDiveCard
        dive={lastDive}
        onPress={() => handleDivePress(lastDive.id)}
      />
    );
  }, [lastDive, handleDivePress]);

  const ListEmpty = useMemo(() => {
    if (isLoading) return null;
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t('home.noDives')}</Text>
        <TouchableOpacity style={styles.syncButton} onPress={handleSync}>
          <Text style={styles.syncButtonText}>{t('home.syncButton')}</Text>
        </TouchableOpacity>
      </View>
    );
  }, [isLoading, t, handleSync]);

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
            onRefresh={refetch}
          />
        }
        contentContainerStyle={allDives.length === 0 ? styles.emptyContainer : undefined}
      />
      {allDives.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={handleSync}>
          <Text style={styles.fabText}>{t('home.syncButton')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 16 },
  syncButton: {
    backgroundColor: '#0066cc',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  syncButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#0066cc',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
