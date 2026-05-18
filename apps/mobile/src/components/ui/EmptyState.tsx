import React from 'react';
import { View, Text } from 'react-native';
import { tokens } from '../../theme';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  onCtaPress,
}: {
  icon: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.space[8] }}>
      <Text style={{ fontSize: 48, marginBottom: tokens.space[4], color: tokens.color.text3 }}>{icon}</Text>
      <Text style={{
        fontSize: tokens.type.heading.size,
        fontWeight: tokens.type.heading.weight,
        color: tokens.color.text,
        textAlign: 'center',
      }}>{title}</Text>
      {body ? (
        <Text style={{
          fontSize: tokens.type.body.size,
          color: tokens.color.text2,
          textAlign: 'center',
          marginTop: tokens.space[2],
          lineHeight: 22,
        }}>{body}</Text>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <Button label={ctaLabel} onPress={onCtaPress} style={{ marginTop: tokens.space[6] }} />
      ) : null}
    </View>
  );
}
