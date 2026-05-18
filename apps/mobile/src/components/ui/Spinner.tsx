import React from 'react';
import { ActivityIndicator } from 'react-native';
import { tokens } from '../../theme';

export function Spinner({ size = 'large' }: { size?: 'small' | 'large' }) {
  return <ActivityIndicator size={size} color={tokens.color.accent} />;
}
