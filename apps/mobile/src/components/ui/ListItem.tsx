import React from 'react';
import { Pressable, View, Text } from 'react-native';
import { tokens } from '../../theme';

export function ListItem({
  title,
  subtitle,
  rightValue,
  rightColor,
  onPress,
}: {
  title: string;
  subtitle?: string;
  rightValue?: string;
  rightColor?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: tokens.space[3],
        paddingHorizontal: tokens.space[4],
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View>
        <Text style={{
          fontSize: tokens.type.bodyStrong.size,
          fontWeight: tokens.type.bodyStrong.weight,
          color: tokens.color.text,
        }}>{title}</Text>
        {subtitle ? (
          <Text style={{
            fontSize: tokens.type.small.size,
            color: tokens.color.text2,
            marginTop: 2,
          }}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[3] }}>
        {rightValue ? (
          <Text style={{
            fontSize: tokens.type.bodyStrong.size,
            fontWeight: '700',
            color: rightColor ?? tokens.color.accent,
          }}>{rightValue}</Text>
        ) : null}
        {onPress ? <Text style={{ color: tokens.color.text3, fontSize: 14 }}>›</Text> : null}
      </View>
    </Pressable>
  );
}
