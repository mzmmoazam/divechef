import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Insight, Severity } from '@divechef/shared/types';
import { tokens } from '../theme';
import { Card } from './ui/Card';

interface InsightCardProps {
  insight: Insight;
}

const SEVERITY_COLORS: Record<Severity, string> = {
  info: tokens.color.accent,
  warn: tokens.color.warning,
  alert: tokens.color.danger,
};

export function InsightCard({ insight }: InsightCardProps) {
  const { t } = useTranslation();
  const borderColor = SEVERITY_COLORS[insight.severity];

  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: borderColor, marginVertical: 6 }}>
      <Text style={{
        fontSize: tokens.type.bodyStrong.size,
        fontWeight: tokens.type.bodyStrong.weight,
        color: tokens.color.text,
        marginBottom: tokens.space[1],
      }}>
        {t(`insights.${insight.ruleId}.title`)}
      </Text>
      <Text style={{
        fontSize: tokens.type.small.size,
        color: tokens.color.text2,
        lineHeight: 18,
      }}>
        {t(`insights.${insight.ruleId}.body`, insight.evidence as Record<string, string>)}
      </Text>
    </Card>
  );
}
