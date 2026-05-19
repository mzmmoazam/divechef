import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { renameDevice, deleteDevice } from '../services/devices';
import i18n from '../i18n';
import type { Niveau, Locale } from '@divechef/shared/types';
import { verificationTier, type ShearwaterModel } from '@divechef/shared';
import type { RootStackParamList } from '../navigation/types';
import { tokens } from '../theme';
import { useActiveDevice } from '../contexts/DeviceContext';
import { Card } from '../components/ui/Card';
import { ListItem } from '../components/ui/ListItem';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { VerificationBadge } from '../components/ui/Badge';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const NIVEAUX: Niveau[] = ['UNKNOWN', 'N1', 'N2', 'N3', 'N4', 'INITIATEUR', 'MF1', 'MF2'];
const LOCALES: { value: Locale; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

const MODEL_LABEL: Record<ShearwaterModel, string> = {
  peregrine: 'Peregrine',
  perdix: 'Perdix',
  'perdix-ai': 'Perdix AI',
  'perdix-2': 'Perdix 2',
  'petrel-2': 'Petrel 2',
  'petrel-3': 'Petrel 3',
  teric: 'Teric',
  'nerd-2': 'Nerd 2',
  tern: 'Tern',
  'unknown-shearwater': 'Other Shearwater',
};

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
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: tokens.space[4],
        borderBottomWidth: 1,
        borderBottomColor: tokens.color.borderSubtle,
      }}
      onPress={onPress}
      disabled={!editable}
      activeOpacity={editable ? 0.6 : 1}
    >
      <Text style={{ fontSize: tokens.type.small.size, color: tokens.color.text2 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{
          fontSize: tokens.type.small.size,
          fontWeight: tokens.type.bodyStrong.weight,
          color: tokens.color.text,
        }}>{value}</Text>
        {editable && (
          <Text style={{ fontSize: 16, color: tokens.color.text3, marginLeft: tokens.space[2] }}>
            {'>'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

type RenameState = { id: string; current: string };

export default function ProfilScreen() {
  const { t } = useTranslation();
  const { user, logout, refreshUser } = useAuth();
  const navigation = useNavigation<NavProp>();
  const { devices, updateDevice, removeDevice } = useActiveDevice();

  const [renameState, setRenameState] = useState<RenameState | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  const openRenameModal = useCallback((id: string, current: string) => {
    setRenameState({ id, current });
    setRenameValue(current);
  }, []);

  const closeRenameModal = useCallback(() => {
    setRenameState(null);
    setRenameValue('');
  }, []);

  const handleSaveRename = useCallback(async () => {
    if (!renameState) return;
    try {
      await renameDevice(renameState.id, renameValue);
      updateDevice(renameState.id, { friendlyName: renameValue });
      closeRenameModal();
    } catch {
      Alert.alert(t('common.error'));
    }
  }, [renameState, renameValue, updateDevice, closeRenameModal, t]);

  const handleDeleteDevice = useCallback((id: string) => {
    Alert.alert(
      'Remove device?',
      'Your dives stay; only the device is removed.',
      [
        { text: 'Cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteDevice(id);
            removeDevice(id);
          },
        },
      ]
    );
  }, [removeDevice]);

  const formatLastSync = (lastSyncAt: string | null): string => {
    if (!lastSyncAt) return 'never';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(lastSyncAt));
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens.color.bgBase }}
      contentContainerStyle={{ padding: tokens.space[4], paddingBottom: tokens.space[8] }}
    >
      <Text style={{
        fontSize: tokens.type.title.size,
        fontWeight: tokens.type.title.weight,
        color: tokens.color.text,
        marginBottom: tokens.space[4],
      }}>
        {t('profile.title')}
      </Text>

      {/* User info section */}
      <View style={{
        backgroundColor: tokens.color.bgElev,
        borderRadius: tokens.radius.card,
        overflow: 'hidden',
        marginBottom: tokens.space[6],
        borderWidth: 1,
        borderColor: tokens.color.borderSubtle,
      }}>
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
      </View>

      {/* Dive computers section */}
      <Text style={{
        fontSize: tokens.type.heading.size,
        fontWeight: tokens.type.heading.weight,
        color: tokens.color.text,
        marginBottom: tokens.space[3],
      }}>
        Your dive computers
      </Text>

      {devices.length === 0 ? (
        <View style={{
          backgroundColor: tokens.color.bgElev,
          borderRadius: tokens.radius.card,
          padding: tokens.space[6],
          alignItems: 'center',
          borderWidth: 1,
          borderColor: tokens.color.borderSubtle,
          marginBottom: tokens.space[6],
        }}>
          <Text style={{
            fontSize: tokens.type.body.size,
            color: tokens.color.text2,
            marginBottom: tokens.space[4],
            textAlign: 'center',
          }}>
            No dive computers yet
          </Text>
          <Button
            label="Add a dive computer"
            variant="ghost"
            onPress={() => navigation.navigate('AddDevice')}
          />
        </View>
      ) : (
        <View style={{
          backgroundColor: tokens.color.bgElev,
          borderRadius: tokens.radius.card,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: tokens.color.borderSubtle,
          marginBottom: tokens.space[6],
        }}>
          {devices.map((device) => {
            const displayName = device.friendlyName ?? MODEL_LABEL[device.model] ?? device.model;
            const tier = verificationTier(device.model);
            const lastFour = device.serialNumber.slice(-4);
            const syncText = formatLastSync(device.lastSyncAt);

            return (
              <View
                key={device.id}
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: tokens.color.borderSubtle,
                }}
              >
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingRight: tokens.space[3],
                }}>
                  <View style={{ flex: 1 }}>
                    <ListItem
                      title={displayName}
                      subtitle={`serial: ...${lastFour}  •  synced: ${syncText}`}
                      onPress={() => openRenameModal(device.id, device.friendlyName ?? MODEL_LABEL[device.model] ?? device.model)}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] }}>
                    <VerificationBadge tier={tier} />
                    <TouchableOpacity
                      onPress={() => handleDeleteDevice(device.id)}
                      style={{ padding: tokens.space[2] }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ color: tokens.color.danger, fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Add another device CTA */}
      {devices.length > 0 && (
        <Button
          label="Add another device"
          variant="ghost"
          onPress={() => navigation.navigate('AddDevice')}
          style={{ marginBottom: tokens.space[4] }}
        />
      )}

      {/* Sync button */}
      <TouchableOpacity
        style={{
          backgroundColor: tokens.color.accent,
          paddingVertical: tokens.space[3],
          borderRadius: tokens.radius.sm,
          alignItems: 'center',
          marginBottom: tokens.space[3],
        }}
        onPress={handleSync}
      >
        <Text style={{
          color: tokens.color.bgBase,
          fontWeight: tokens.type.bodyStrong.weight,
          fontSize: tokens.type.bodyStrong.size,
        }}>
          {t('profile.syncButton')}
        </Text>
      </TouchableOpacity>

      {/* Logout button */}
      <TouchableOpacity
        style={{
          backgroundColor: tokens.color.bgElev,
          paddingVertical: tokens.space[3],
          borderRadius: tokens.radius.sm,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: tokens.color.danger,
        }}
        onPress={handleLogout}
      >
        <Text style={{
          color: tokens.color.danger,
          fontWeight: tokens.type.bodyStrong.weight,
          fontSize: tokens.type.bodyStrong.size,
        }}>
          {t('profile.logoutButton')}
        </Text>
      </TouchableOpacity>

      {/* Rename modal */}
      <Modal
        visible={renameState !== null}
        transparent
        animationType="fade"
        onRequestClose={closeRenameModal}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          padding: tokens.space[4],
        }}>
          <Card>
            <Text style={{
              fontSize: tokens.type.heading.size,
              fontWeight: tokens.type.heading.weight,
              color: tokens.color.text,
              marginBottom: tokens.space[4],
            }}>
              Rename device
            </Text>
            <Input
              label="Friendly name"
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder={renameState?.current ?? ''}
              placeholderTextColor={tokens.color.text3}
            />
            <View style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: tokens.space[3],
              marginTop: tokens.space[4],
            }}>
              <Button label="Cancel" variant="ghost" onPress={closeRenameModal} />
              <Button label="Save" onPress={handleSaveRename} />
            </View>
          </Card>
        </View>
      </Modal>
    </ScrollView>
  );
}
