import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { DiveSummary } from '@divechef/shared/types';
import { Card } from './ui/Card';
import { ScoreNumber } from './ui/ScoreNumber';
import { tokens } from '../theme';

interface LastDiveCardProps {
  dive: DiveSummary;
  onPress: () => void;
}

export function LastDiveCard({ dive, onPress }: LastDiveCardProps) {
  const { t } = useTranslation();

  const date = new Date(dive.startedAt);
  const formattedDate = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const durationMin = Math.round(dive.durationSec / 60);

  return (
    <TouchableOpacity onPress={onPress} style={{ marginHorizontal: tokens.space[4], marginVertical: tokens.space[3] }}>
      <Card hero>
        <Text style={{ fontSize: tokens.type.small.size, color: tokens.color.text2, fontWeight: tokens.type.small.weight }}>
          {t('home.lastDive')}
        </Text>
        <Text style={{ fontSize: tokens.type.heading.size, color: tokens.color.text, fontWeight: tokens.type.heading.weight, marginTop: tokens.space[1] }}>
          {formattedDate}
        </Text>
        <View style={{ flexDirection: 'row', marginTop: tokens.space[4], gap: tokens.space[6], alignItems: 'baseline' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontSize: tokens.type.display.size, fontWeight: tokens.type.display.weight, color: tokens.color.accent, letterSpacing: tokens.type.display.letterSpacing }}>
              {dive.maxDepthM.toFixed(1)}
            </Text>
            <Text style={{ fontSize: tokens.type.small.size, color: tokens.color.text2, marginLeft: 2 }}>m</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontSize: tokens.type.display.size, fontWeight: tokens.type.display.weight, color: tokens.color.accent, letterSpacing: tokens.type.display.letterSpacing }}>
              {durationMin}
            </Text>
            <Text style={{ fontSize: tokens.type.small.size, color: tokens.color.text2, marginLeft: 2 }}>min</Text>
          </View>
          {dive.safetyScore != null && (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
              <ScoreNumber value={dive.safetyScore} size={tokens.type.display.size} />
              <Text style={{ fontSize: tokens.type.small.size, color: tokens.color.text2 }}>/100</Text>
            </View>
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );
}
