import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DiveSummary } from '@divechef/shared/types';
import { ListItem } from './ui/ListItem';
import { tokens } from '../theme';

interface DiveListItemProps {
  dive: DiveSummary;
  onPress: () => void;
}

export function DiveListItem({ dive, onPress }: DiveListItemProps) {
  const { t } = useTranslation();

  const date = new Date(dive.startedAt);
  const formattedDate = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const durationMin = Math.round(dive.durationSec / 60);
  const subtitle = `${t('home.depth', { depth: dive.maxDepthM.toFixed(1) })}  ${t('home.duration', { duration: durationMin })}`;
  const rightValue = dive.safetyScore != null
    ? t('home.score', { score: dive.safetyScore })
    : undefined;

  return (
    <ListItem
      title={formattedDate}
      subtitle={subtitle}
      rightValue={rightValue}
      rightColor={tokens.color.accent}
      onPress={onPress}
    />
  );
}
