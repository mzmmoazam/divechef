import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AuthScreenProps } from '../navigation/types';

export default function DisclaimerScreen({ navigation }: AuthScreenProps<'Disclaimer'>) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('onboarding.welcome')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>{t('onboarding.disclaimer')}</Text>
        </View>
      </ScrollView>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('BlePermission')}
      >
        <Text style={styles.buttonText}>{t('onboarding.acceptDisclaimer')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  content: { flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 32 },
  disclaimerBox: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  disclaimerText: { fontSize: 14, lineHeight: 22, color: '#333' },
  button: {
    backgroundColor: '#0066cc',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 16 },
});
