import React from 'react';
import { Pressable, Text } from 'react-native';
import { tokens } from '../../theme';

export function Tab({
  icon,
  label,
  active,
  onPress,
}: { icon: string; label: string; active: boolean; onPress: () => void }) {
  const c = active ? tokens.color.accent : tokens.color.text3;
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: tokens.space[2] }}>
      <Text style={{ color: c, fontSize: 18 }}>{icon}</Text>
      <Text style={{
        color: c,
        fontSize: tokens.type.caption.size,
        fontWeight: tokens.type.caption.weight,
        letterSpacing: tokens.type.caption.letterSpacing,
        textTransform: 'uppercase',
        marginTop: 2,
      }}>{label}</Text>
    </Pressable>
  );
}
