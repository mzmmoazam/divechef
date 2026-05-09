import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function BlePermissionScreen() {
  const { t } = useTranslation();

  const handleGrant = () => {
    // In Plan 3, this will request actual BLE permissions.
    // For now the user is already authenticated (signup completed in NiveauPicker),
    // so this is just informational. The auth state change will cause RootNavigator
    // to switch to MainTabs automatically.
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>BLE</Text>
      </View>
      <Text style={styles.title}>{t('onboarding.blePermission')}</Text>
      <TouchableOpacity style={styles.button} onPress={handleGrant}>
        <Text style={styles.buttonText}>{t('onboarding.grantBle')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e6f0ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: { fontSize: 20, fontWeight: 'bold', color: '#0066cc' },
  title: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    color: '#333',
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  button: {
    backgroundColor: '#0066cc',
    padding: 14,
    borderRadius: 8,
    width: '100%',
  },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 16 },
});
