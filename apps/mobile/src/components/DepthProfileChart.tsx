import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { useDiveSamples } from '../hooks/useDives';

interface DepthProfileChartProps {
  diveId: string;
}

export function DepthProfileChart({ diveId }: DepthProfileChartProps) {
  const { data: samples, isLoading } = useDiveSamples(diveId);

  if (isLoading || !samples || samples.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color="#0066cc" />
      </View>
    );
  }

  const chartData = samples.map((s) => ({
    timeMin: s.tSec / 60,
    depth: -s.depthM,
  }));

  return (
    <View style={styles.container}>
      <CartesianChart
        data={chartData}
        xKey="timeMin"
        yKeys={['depth']}
        axisOptions={{
          formatXLabel: (v) => `${Math.round(Number(v))}`,
          formatYLabel: (v) => `${Math.abs(Number(v)).toFixed(0)}`,
        }}
      >
        {({ points }) => (
          <Line
            points={points.depth}
            color="#0066cc"
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
