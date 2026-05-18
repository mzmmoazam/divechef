import React from 'react';
import { Pressable, Text, ViewStyle, StyleProp } from 'react-native';
import { tokens } from '../../theme';

type Variant = 'filled' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'filled',
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    variant === 'filled' ? tokens.color.accent :
    variant === 'danger' ? tokens.color.danger :
    'transparent';
  const fg =
    variant === 'filled' ? tokens.color.bgBase :
    variant === 'ghost' ? tokens.color.accent :
    tokens.color.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: variant === 'ghost' ? tokens.color.borderSubtle : 'transparent',
          borderWidth: variant === 'ghost' ? 1 : 0,
          paddingVertical: tokens.space[3],
          paddingHorizontal: tokens.space[6],
          borderRadius: tokens.radius.pill,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{
        color: fg,
        fontSize: tokens.type.bodyStrong.size,
        fontWeight: tokens.type.bodyStrong.weight,
      }}>
        {label}
      </Text>
    </Pressable>
  );
}
