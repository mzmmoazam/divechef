import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { RootStackProps } from '../navigation/types';

export default function DiveDetailScreen({ route }: RootStackProps<'DiveDetail'>) {
  const { diveId } = route.params;

  return (
    <View style={styles.container}>
      <Text>DiveDetailScreen: {diveId}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
