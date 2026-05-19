import React, { useState, useRef } from 'react';
import { View, Text, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { useAuth } from '../hooks/useAuth';
import type { AuthScreenProps } from '../navigation/types';
import type { Niveau, Locale } from '@divechef/shared/types';
import { tokens } from '../theme';
import { ListItem } from '../components/ui/ListItem';

const NIVEAUX: Niveau[] = ['N1', 'N2', 'N3', 'N4', 'INITIATEUR', 'MF1', 'MF2'];

export default function NiveauPickerScreen({ navigation, route }: AuthScreenProps<'NiveauPicker'>) {
  const { t } = useTranslation();
  const { signup } = useAuth();
  const { email, password } = route.params;
  const [selected, setSelected] = useState<Niveau | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const handleSelect = async (niveau: Niveau) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSelected(niveau);
    setLoading(true);

    const deviceLocale = getLocales()[0]?.languageCode;
    const locale: Locale = deviceLocale === 'fr' ? 'fr' : 'en';

    try {
      await signup(email, password, niveau, locale);
      navigation.navigate('Disclaimer');
    } catch (err: unknown) {
      Alert.alert(
        t('common.error'),
        err instanceof Error ? err.message : t('common.error')
      );
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: tokens.space[6], backgroundColor: tokens.color.bgBase }}>
      <Text style={{
        fontSize: tokens.type.title.size,
        fontWeight: tokens.type.title.weight,
        color: tokens.color.text,
        marginBottom: tokens.space[6],
        textAlign: 'center',
      }}>
        {t('onboarding.pickNiveau')}
      </Text>
      <View style={{
        borderWidth: 1,
        borderColor: tokens.color.borderSubtle,
        borderRadius: tokens.radius.card,
        overflow: 'hidden',
        backgroundColor: tokens.color.bgElev,
      }}>
        {NIVEAUX.map((niveau, index) => (
          <View key={niveau} style={index < NIVEAUX.length - 1 ? {
            borderBottomWidth: 1,
            borderBottomColor: tokens.color.borderSubtle,
          } : undefined}>
            <ListItem
              title={t(`niveau.${niveau}`)}
              rightValue={selected === niveau ? '✓' : undefined}
              rightColor={tokens.color.accent}
              onPress={loading ? undefined : () => handleSelect(niveau)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
