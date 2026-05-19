import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../theme';
import { EmptyState } from '../components/ui/EmptyState';

export default function BlePermissionScreen() {
  const { t } = useTranslation();

  const handleGrant = () => {
    // In Plan 3, this will request actual BLE permissions.
    // For now the user is already authenticated (signup completed in NiveauPicker),
    // so this is just informational. The auth state change will cause RootNavigator
    // to switch to MainTabs automatically.
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bgBase }}>
      <EmptyState
        icon="📡"
        title={t('onboarding.blePermission')}
        ctaLabel={t('onboarding.grantBle')}
        onCtaPress={handleGrant}
      />
    </View>
  );
}
