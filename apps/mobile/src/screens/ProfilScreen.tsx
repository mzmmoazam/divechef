import React, { useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import i18n from '../i18n';
import type { Niveau, Locale } from '@divechef/shared/types';
import type { RootStackParamList } from '../navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const NIVEAUX: Niveau[] = ['UNKNOWN', 'N1', 'N2', 'N3', 'N4', 'INITIATEUR', 'MF1', 'MF2'];
const LOCALES: { value: Locale; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

function ProfileRow({
  label,
  value,
  editable,
  onPress,
}: {
  label: string;
  value: string;
  editable?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!editable}
      activeOpacity={editable ? 0.6 : 1}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{value}</Text>
        {editable && <Text style={styles.editIndicator}>{'>'}</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function ProfilScreen() {
  const { t } = useTranslation();
  const { user, logout, refreshUser } = useAuth();
  const navigation = useNavigation<NavProp>();

  const handleNiveauPress = useCallback(() => {
    Alert.alert(
      t('profile.niveau'),
      undefined,
      NIVEAUX.map((n) => ({
        text: t(`niveau.${n}`),
        onPress: async () => {
          try {
            await api.patch('/api/me', { niveau: n });
            await refreshUser();
          } catch {
            Alert.alert(t('common.error'));
          }
        },
      }))
    );
  }, [t, refreshUser]);

  const handleLocalePress = useCallback(() => {
    Alert.alert(
      t('profile.locale'),
      undefined,
      LOCALES.map((l) => ({
        text: l.label,
        onPress: async () => {
          try {
            await api.patch('/api/me', { locale: l.value });
            await i18n.changeLanguage(l.value);
            await refreshUser();
          } catch {
            Alert.alert(t('common.error'));
          }
        },
      }))
    );
  }, [t, refreshUser]);

  const handleSync = useCallback(() => {
    navigation.navigate('Sync');
  }, [navigation]);

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('profile.title')}</Text>

      <View style={styles.section}>
        <ProfileRow
          label={t('profile.email')}
          value={user?.email ?? '—'}
        />
        <ProfileRow
          label={t('profile.niveau')}
          value={user ? t(`niveau.${user.niveau}`) : '—'}
          editable
          onPress={handleNiveauPress}
        />
        <ProfileRow
          label={t('profile.locale')}
          value={LOCALES.find((l) => l.value === (user?.locale ?? i18n.language))?.label ?? '—'}
          editable
          onPress={handleLocalePress}
        />
        <ProfileRow
          label={t('profile.connectedDevice')}
          value={t('profile.noDevice')}
        />
      </View>

      <TouchableOpacity style={styles.syncButton} onPress={handleSync}>
        <Text style={styles.syncButtonText}>{t('profile.syncButton')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>{t('profile.logoutButton')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 16 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowLabel: { fontSize: 14, color: '#666' },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  rowValue: { fontSize: 14, fontWeight: '500', color: '#111' },
  editIndicator: { fontSize: 16, color: '#999', marginLeft: 8 },
  syncButton: {
    backgroundColor: '#0066cc',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  syncButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  logoutButton: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  logoutButtonText: { color: '#f44336', fontWeight: '600', fontSize: 16 },
});
