import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSync } from '../hooks/useSync';
import type { RootStackProps } from '../navigation/types';

export default function SyncScreen({ navigation }: RootStackProps<'Sync'>) {
  const { t } = useTranslation();
  const {
    state,
    error,
    syncedCount,
    currentDiveIndex,
    totalDives,
    startSync,
    cancel,
  } = useSync();

  const renderContent = () => {
    switch (state) {
      case 'idle':
        return (
          <View style={styles.centered}>
            <Text style={styles.description}>{t('sync.title')}</Text>
            <TouchableOpacity style={styles.button} onPress={startSync}>
              <Text style={styles.buttonText}>{t('home.syncButton')}</Text>
            </TouchableOpacity>
          </View>
        );

      case 'scanning':
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#0066cc" />
            <Text style={styles.statusText}>{t('sync.scanning')}</Text>
            <TouchableOpacity style={styles.cancelButton} onPress={cancel}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        );

      case 'connecting':
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#0066cc" />
            <Text style={styles.statusText}>
              {t('sync.connecting', { deviceName: 'Peregrine' })}
            </Text>
          </View>
        );

      case 'listing':
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#0066cc" />
            <Text style={styles.statusText}>{t('common.loading')}</Text>
          </View>
        );

      case 'downloading':
      case 'uploading':
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#0066cc" />
            <Text style={styles.statusText}>
              {t('sync.downloadingDive', {
                current: currentDiveIndex,
                total: totalDives,
              })}
            </Text>
            {syncedCount > 0 && (
              <Text style={styles.countText}>
                {t('sync.complete', { count: syncedCount })}
              </Text>
            )}
            <TouchableOpacity style={styles.cancelButton} onPress={cancel}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        );

      case 'complete':
        return (
          <View style={styles.centered}>
            <Text style={styles.successIcon}>OK</Text>
            <Text style={styles.successText}>
              {t('sync.complete', { count: syncedCount })}
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.buttonText}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </View>
        );

      case 'error':
        return (
          <View style={styles.centered}>
            <Text style={styles.errorIcon}>!</Text>
            <Text style={styles.errorText}>
              {error === 'no_device' || error === 'no_device_found'
                ? t('sync.noDevice')
                : error === 'connection_rejected'
                ? t('sync.connectionRejected')
                : error === 'device_busy'
                ? t('sync.deviceBusy')
                : error === 'ble_connection_lost'
                ? t('sync.connectionLost')
                : t('common.error')}
            </Text>
            {syncedCount > 0 && (
              <Text style={styles.countText}>
                {t('sync.partialSuccess', { synced: syncedCount, total: '?' })}
              </Text>
            )}
            <TouchableOpacity style={styles.button} onPress={startSync}>
              <Text style={styles.buttonText}>{t('sync.retryButton')}</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  return <View style={styles.container}>{renderContent()}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  description: { fontSize: 18, fontWeight: '600', marginBottom: 24, textAlign: 'center' },
  statusText: { fontSize: 16, color: '#333', marginTop: 16, textAlign: 'center' },
  countText: { fontSize: 14, color: '#666', marginTop: 8 },
  button: {
    backgroundColor: '#0066cc',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginTop: 24,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  cancelButton: { marginTop: 24 },
  cancelText: { color: '#999', fontSize: 14 },
  successIcon: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#22c55e',
    marginBottom: 12,
  },
  successText: { fontSize: 18, fontWeight: '600', color: '#22c55e' },
  errorIcon: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 12,
  },
  errorText: { fontSize: 16, color: '#ef4444', textAlign: 'center' },
});
