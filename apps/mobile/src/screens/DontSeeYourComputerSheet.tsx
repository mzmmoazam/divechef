import React from 'react';
import { View, ScrollView, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../theme';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export default function DontSeeYourComputerSheet() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('addDevice.dontSeeYours.title')}</Text>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('addDevice.dontSeeYours.petrel1Title')}</Text>
        <Text style={styles.cardBody}>{t('addDevice.dontSeeYours.petrel1Body')}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('addDevice.dontSeeYours.otherShearwaterTitle')}</Text>
        <Text style={styles.cardBody}>{t('addDevice.dontSeeYours.otherShearwaterBody')}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('addDevice.dontSeeYours.otherVendorTitle')}</Text>
        <Text style={styles.cardBody}>{t('addDevice.dontSeeYours.otherVendorBody')}</Text>
      </Card>

      <Button
        label={t('common.close', 'Close')}
        variant="ghost"
        onPress={() => navigation.goBack()}
        style={styles.closeButton}
        testID="close-button"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bgBase },
  content: { padding: tokens.space[4], paddingBottom: tokens.space[8] },
  title: {
    color: tokens.color.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: tokens.space[4],
  },
  card: { marginBottom: tokens.space[3] },
  cardTitle: {
    color: tokens.color.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: tokens.space[1],
  },
  cardBody: {
    color: tokens.color.text2,
    fontSize: 14,
    lineHeight: 20,
  },
  closeButton: { marginTop: tokens.space[4] },
});
