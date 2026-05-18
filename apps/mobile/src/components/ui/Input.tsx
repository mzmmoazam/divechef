import React from 'react';
import { TextInput, View, Text, TextInputProps } from 'react-native';
import { tokens } from '../../theme';

export function Input({
  label,
  error,
  ...rest
}: TextInputProps & { label?: string; error?: string }) {
  return (
    <View>
      {label ? (
        <Text style={{
          fontSize: tokens.type.caption.size,
          color: tokens.color.text2,
          letterSpacing: tokens.type.caption.letterSpacing,
          textTransform: 'uppercase',
          marginBottom: tokens.space[2],
          fontWeight: tokens.type.caption.weight,
        }}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={tokens.color.text3}
        {...rest}
        style={[{
          backgroundColor: tokens.color.bgElev,
          borderColor: error ? tokens.color.danger : tokens.color.borderSubtle,
          borderWidth: 1,
          borderRadius: tokens.radius.sm,
          paddingHorizontal: tokens.space[4],
          paddingVertical: tokens.space[3],
          color: tokens.color.text,
          fontSize: tokens.type.body.size,
        }, rest.style]}
      />
      {error ? (
        <Text style={{ color: tokens.color.danger, fontSize: tokens.type.small.size, marginTop: tokens.space[2] }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
