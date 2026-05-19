import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AuthScreenProps } from '../navigation/types';
import { tokens } from '../theme';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export default function DisclaimerScreen({ navigation }: AuthScreenProps<'Disclaimer'>) {
  const { t } = useTranslation();

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bgBase, padding: tokens.space[6] }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <Text style={{
          fontSize: tokens.type.title.size,
          fontWeight: tokens.type.title.weight,
          color: tokens.color.text,
          textAlign: 'center',
          marginBottom: tokens.space[2],
        }}>
          {t('onboarding.welcome')}
        </Text>
        <Text style={{
          fontSize: tokens.type.body.size,
          color: tokens.color.text2,
          textAlign: 'center',
          marginBottom: tokens.space[8],
        }}>
          {t('onboarding.subtitle')}
        </Text>
        <Card>
          <Text style={{
            fontSize: tokens.type.body.size,
            lineHeight: 22,
            color: tokens.color.text,
          }}>
            {t('onboarding.disclaimer')}
          </Text>
        </Card>
      </ScrollView>
      <Button
        label={t('onboarding.acceptDisclaimer')}
        onPress={() => navigation.navigate('BlePermission')}
        variant="filled"
        style={{ marginTop: tokens.space[4] }}
      />
    </View>
  );
}
