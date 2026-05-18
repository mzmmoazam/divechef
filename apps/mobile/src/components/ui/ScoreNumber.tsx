import React from 'react';
import { Text } from 'react-native';
import { tokens } from '../../theme';

const PLATFORM_MONO = 'SF Mono';   // iOS system mono; Android falls back via fontFamily

export function ScoreNumber({ value, size = 14 }: { value: number; size?: number }) {
  const c =
    value >= 70 ? tokens.color.success :
    value >= 30 ? tokens.color.warning :
    tokens.color.danger;
  return (
    <Text style={{
      fontFamily: PLATFORM_MONO,
      fontSize: size,
      fontWeight: '700',
      color: c,
      letterSpacing: -0.02,
    }}>{value}</Text>
  );
}
