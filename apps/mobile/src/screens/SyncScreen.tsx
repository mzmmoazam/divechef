import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { RootStackProps } from '../navigation/types';

export default function SyncScreen(_props: RootStackProps<'Sync'>) {
  return (
    <View style={styles.container}>
      <Text>SyncScreen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
