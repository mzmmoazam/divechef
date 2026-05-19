import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import type { AuthScreenProps } from '../navigation/types';
import { tokens } from '../theme';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      Alert.alert(
        t('common.error'),
        err instanceof Error ? err.message : t('common.error')
      );
    } finally {
      setLoading(false);
    }
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
        {t('auth.login')}
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
          textContentType="password"
        />
      </View>
      <Button
        label={loading ? t('common.loading') : t('auth.loginButton')}
        onPress={handleLogin}
        variant="filled"
        disabled={loading}
        style={{ marginTop: tokens.space[2] }}
      />
      <Button
        label={t('auth.noAccount')}
        onPress={() => navigation.navigate('Signup')}
        variant="ghost"
        style={{ marginTop: tokens.space[4] }}
      />
    </View>
  );
}
