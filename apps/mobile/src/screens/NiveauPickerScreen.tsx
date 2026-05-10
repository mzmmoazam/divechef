import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { useAuth } from '../hooks/useAuth';
import type { AuthScreenProps } from '../navigation/types';
import type { Niveau, Locale } from '@divechef/shared/types';

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
    <View style={styles.container}>
      <Text style={styles.title}>{t('onboarding.pickNiveau')}</Text>
      {NIVEAUX.map((niveau) => (
        <TouchableOpacity
          key={niveau}
          style={[
            styles.option,
            selected === niveau && styles.optionSelected,
          ]}
          onPress={() => handleSelect(niveau)}
          disabled={loading}
        >
          <Text
            style={[
              styles.optionText,
              selected === niveau && styles.optionTextSelected,
            ]}
          >
            {t(`niveau.${niveau}`)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  option: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  optionSelected: {
    borderColor: '#0066cc',
    backgroundColor: '#e6f0ff',
  },
  optionText: { fontSize: 16, textAlign: 'center' },
  optionTextSelected: { color: '#0066cc', fontWeight: '600' },
});
