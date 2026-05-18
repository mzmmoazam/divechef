import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../theme';

export function Card({
  children,
  hero = false,
  style,
}: {
  children: React.ReactNode;
  hero?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (hero) {
    return (
      <LinearGradient
        colors={[tokens.color.bgDeep, tokens.color.bgElev, tokens.color.bgBase]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[{
          borderRadius: tokens.radius.hero,
          padding: tokens.space[6],
          borderWidth: 1,
          borderColor: tokens.color.borderSubtle,
        }, style]}
      >
        {children}
      </LinearGradient>
    );
  }
  return (
    <View style={[{
      backgroundColor: tokens.color.bgElev,
      borderRadius: tokens.radius.card,
      padding: tokens.space[4],
      borderWidth: 1,
      borderColor: tokens.color.borderSubtle,
    }, style]}>
      {children}
    </View>
  );
}
