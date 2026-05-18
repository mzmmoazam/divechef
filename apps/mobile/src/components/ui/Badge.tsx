import React from 'react';
import { View, Text } from 'react-native';
import { tokens } from '../../theme';
import type { ShearwaterVerificationTier } from '@divechef/shared';

type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export function Badge({
  label,
  tone = 'accent',
  outline = false,
}: { label: string; tone?: Tone; outline?: boolean }) {
  const colorMap: Record<Tone, string> = {
    accent: tokens.color.accent,
    success: tokens.color.success,
    warning: tokens.color.warning,
    danger: tokens.color.danger,
    neutral: tokens.color.text2,
  };
  const c = colorMap[tone];
  return (
    <View style={{
      backgroundColor: outline ? 'transparent' : c,
      borderColor: c,
      borderWidth: outline ? 1 : 0,
      paddingHorizontal: tokens.space[3],
      paddingVertical: tokens.space[1],
      borderRadius: tokens.radius.pill,
      alignSelf: 'flex-start',
    }}>
      <Text style={{
        color: outline ? c : tokens.color.bgBase,
        fontSize: tokens.type.caption.size,
        fontWeight: tokens.type.caption.weight,
        letterSpacing: tokens.type.caption.letterSpacing,
        textTransform: 'uppercase',
      }}>{label}</Text>
    </View>
  );
}

/** Maps the shared verification-tier enum to a Badge label + tone. */
export function VerificationBadge({ tier }: { tier: ShearwaterVerificationTier }) {
  if (tier === 'verified') return <Badge label="Verified" tone="success" />;
  if (tier === 'experimental') return <Badge label="Experimental" tone="warning" outline />;
  return <Badge label="Compatible" tone="neutral" outline />;
}
