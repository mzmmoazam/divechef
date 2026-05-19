import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { useDiveSamples } from '../hooks/useDives';
import { tokens } from '../theme';
import { Spinner } from './ui/Spinner';

interface DepthProfileChartProps {
  diveId: string;
}

export function DepthProfileChart({ diveId }: DepthProfileChartProps) {
  const { data: samples, isLoading } = useDiveSamples(diveId);

  const chartData = useMemo(
    () =>
      samples && samples.length > 0
        ? samples.map((s) => ({ timeMin: s.tSec / 60, depth: -s.depthM }))
        : [],
    [samples]
  );

  if (isLoading || chartData.length === 0) {
    return (
      <View style={styles.loading}>
        <Spinner size="small" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CartesianChart
        data={chartData}
        xKey="timeMin"
        yKeys={['depth']}
        axisOptions={{
          formatXLabel: (v) => `${Math.round(Number(v))}`,
          formatYLabel: (v) => `${Math.abs(Number(v)).toFixed(0)}`,
          labelColor: tokens.color.text2,
          lineColor: tokens.color.borderSubtle,
          tickCount: 5,
        }}
      >
        {({ points }) => (
          <Line
            points={points.depth}
            color={tokens.color.accent}
            strokeWidth={2}
            curveType="monotoneX"
          />
        )}
      </CartesianChart>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 220, marginVertical: 8 },
  loading: { height: 220, justifyContent: 'center', alignItems: 'center' },
});
