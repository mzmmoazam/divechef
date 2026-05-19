import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSync } from '../hooks/useSync';
import { useActiveDevice } from '../contexts/DeviceContext';
import type { RootStackProps } from '../navigation/types';
import { tokens } from '../theme';
import { EmptyState } from '../components/ui/EmptyState';
import { ListItem } from '../components/ui/ListItem';
import { Spinner } from '../components/ui/Spinner';
import { VerificationBadge } from '../components/ui/Badge';
import { FirstSyncToast } from '../components/FirstSyncToast';
import { verificationTier } from '@divechef/shared';

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

  const { devices, selectedDeviceSerial, setActive } = useActiveDevice();
  const [toastDismissed, setToastDismissed] = useState(false);

  const activeDevice = devices.find((d) => d.serialNumber === selectedDeviceSerial) ?? null;

  // 0 devices: show empty state
  if (devices.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="⚓"
          title="No dive computer yet"
          body="Add your dive computer to get started."
          ctaLabel="Add a dive computer"
          onCtaPress={() => navigation.navigate('AddDevice')}
        />
      </View>
    );
  }

  // 2+ devices, none selected: show picker
  if (devices.length >= 2 && selectedDeviceSerial == null) {
    return (
      <View style={styles.container}>
        <Text style={styles.pickerHeading}>Choose a dive computer</Text>
        <ScrollView>
          {devices.map((device) => (
            <ListItem
              key={device.serialNumber}
              title={device.friendlyName ?? device.model}
              subtitle={device.serialNumber}
              rightValue={undefined}
              onPress={() => setActive(device.serialNumber)}
            />
          ))}
        </ScrollView>
        {devices.map((device) => (
          <View key={`badge-${device.serialNumber}`} style={{ display: 'none' }}>
            <VerificationBadge tier={verificationTier(device.model)} />
          </View>
        ))}
      </View>
    );
  }

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
            <Spinner size="large" />
            <Text style={styles.statusText}>{t('sync.scanning')}</Text>
            <TouchableOpacity style={styles.cancelButton} onPress={cancel}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        );

      case 'connecting':
        return (
          <View style={styles.centered}>
            <Spinner size="large" />
            <Text style={styles.statusText}>
              {t('sync.connecting', { deviceName: activeDevice?.friendlyName ?? activeDevice?.model ?? 'Peregrine' })}
            </Text>
          </View>
        );

      case 'listing':
        return (
          <View style={styles.centered}>
            <Spinner size="large" />
            <Text style={styles.statusText}>{t('common.loading')}</Text>
          </View>
        );

      case 'downloading':
      case 'uploading':
        return (
          <View style={styles.centered}>
            <Spinner size="large" />
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
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successText}>
              {t('sync.complete', { count: syncedCount })}
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.buttonText}>{t('common.ok')}</Text>
            </TouchableOpacity>
            {!toastDismissed && activeDevice ? (
              <FirstSyncToast
                tier={verificationTier(activeDevice.model)}
                failedStage={null}
                onDismiss={() => setToastDismissed(true)}
              />
            ) : null}
          </View>
        );

      case 'error':
        return (
          <EmptyState
            icon="!"
            title={
              error === 'no_device' || error === 'no_device_found'
                ? t('sync.noDevice')
                : error === 'connection_rejected'
                ? t('sync.connectionRejected')
                : error === 'device_busy'
                ? t('sync.deviceBusy')
                : error === 'ble_connection_lost'
                ? t('sync.connectionLost')
                : t('common.error')
            }
            body={
              syncedCount > 0
                ? t('sync.partialSuccess', { synced: syncedCount, total: '?' })
                : undefined
            }
            ctaLabel={t('sync.retryButton')}
            onCtaPress={startSync}
          />
        );

      default:
        return null;
    }
  };

  return <View style={styles.container}>{renderContent()}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bgBase },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: tokens.space[6] },
  pickerHeading: {
    fontSize: tokens.type.heading.size,
    fontWeight: tokens.type.heading.weight,
    color: tokens.color.text,
    padding: tokens.space[4],
    paddingBottom: tokens.space[2],
  },
  description: {
    fontSize: tokens.type.heading.size,
    fontWeight: tokens.type.heading.weight,
    color: tokens.color.text,
    marginBottom: tokens.space[6],
    textAlign: 'center',
  },
  statusText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.text2,
    marginTop: tokens.space[4],
    textAlign: 'center',
  },
  countText: {
    fontSize: tokens.type.small.size,
    color: tokens.color.text2,
    marginTop: tokens.space[2],
  },
  button: {
    backgroundColor: tokens.color.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: tokens.radius.card,
    marginTop: tokens.space[6],
  },
  buttonText: { color: tokens.color.bgBase, fontWeight: '600', fontSize: tokens.type.body.size },
  cancelButton: { marginTop: tokens.space[6] },
  cancelText: { color: tokens.color.text3, fontSize: tokens.type.small.size },
  successIcon: {
    fontSize: 24,
    fontWeight: 'bold',
    color: tokens.color.success,
    marginBottom: tokens.space[3],
  },
  successText: {
    fontSize: tokens.type.heading.size,
    fontWeight: tokens.type.heading.weight,
    color: tokens.color.success,
  },
});
