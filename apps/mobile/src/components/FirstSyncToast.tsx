import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { tokens } from '../theme';
import type { ShearwaterVerificationTier } from '@divechef/shared';

export function FirstSyncToast({
  tier,
  failedStage,
  onDismiss,
}: {
  tier: ShearwaterVerificationTier;
  failedStage?: string | null;
  onDismiss: () => void;
}) {
  if (tier === 'verified') return null;
  const success = !failedStage;
  const message = success
    ? "First sync looks good — let us know how it went."
    : `First sync hit a snag at "${failedStage}". Could you share the details so we can improve support?`;
  return (
    <View
      testID="first-sync-toast"
      style={[styles.toast, { backgroundColor: success ? tokens.color.success : tokens.color.danger }]}
    >
      <Text style={styles.text}>{message}</Text>
      <Pressable onPress={onDismiss} style={styles.dismiss} accessibilityRole="button">
        <Text style={styles.dismissText}>OK</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    padding: tokens.space[4],
    margin: tokens.space[4],
    borderRadius: tokens.radius.card,
  },
  text: {
    color: tokens.color.bgBase,
    fontWeight: '600',
    fontSize: tokens.type.body.size,
  },
  dismiss: {
    alignSelf: 'flex-end',
    marginTop: tokens.space[2],
  },
  dismissText: {
    color: tokens.color.bgBase,
    fontWeight: '700',
  },
});
