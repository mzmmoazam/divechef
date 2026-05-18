import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueueFlush } from '../hooks/useQueueFlush';

export function QueueBanner({ deviceSerial }: { deviceSerial: string | null }) {
  const { t } = useTranslation();
  const { pendingCount } = useQueueFlush(deviceSerial);

  if (pendingCount === 0) {
    return null;
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {t('queue.pendingCount', { count: pendingCount })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fff3cd',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ffc107',
  },
  text: {
    fontSize: 13,
    color: '#856404',
    fontWeight: '500',
    textAlign: 'center',
  },
});
