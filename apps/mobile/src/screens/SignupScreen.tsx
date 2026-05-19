import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AuthScreenProps } from '../navigation/types';
import { tokens } from '../theme';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function SignupScreen({ navigation }: AuthScreenProps<'Signup'>) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleNext = () => {
    if (!email.trim() || !password.trim()) return;
    if (password !== confirmPassword) {
      Alert.alert(t('common.error'), t('auth.passwordMismatch'));
      return;
    }
    navigation.navigate('NiveauPicker', { email, password });
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: tokens.space[6], backgroundColor: tokens.color.bgBase }}>
      <Text style={{
        fontSize: tokens.type.display.size,
        fontWeight: tokens.type.display.weight,
        color: tokens.color.text,
        marginBottom: tokens.space[6],
        textAlign: 'center',
      }}>
        {t('auth.signup')}
      </Text>
      <View style={{ marginBottom: tokens.space[3] }}>
        <Input
          placeholder={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
      </View>
      <View style={{ marginBottom: tokens.space[3] }}>
        <Input
          placeholder={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
        />
      </View>
      <View style={{ marginBottom: tokens.space[3] }}>
        <Input
          placeholder={t('auth.confirmPassword')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          textContentType="newPassword"
        />
      </View>
      <Button
        label={t('auth.signupButton')}
        onPress={handleNext}
        variant="filled"
        style={{ marginTop: tokens.space[2] }}
      />
      <Button
        label={t('auth.hasAccount')}
        onPress={() => navigation.navigate('Login')}
        variant="ghost"
        style={{ marginTop: tokens.space[4] }}
      />
    </View>
  );
}
