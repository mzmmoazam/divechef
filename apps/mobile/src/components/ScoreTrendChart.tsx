import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { tokens } from '../theme';

interface ScoreTrendChartProps {
  data: { date: string; score: number }[];
}

export function ScoreTrendChart({ data }: ScoreTrendChartProps) {
  const chartData = useMemo(
    () => data.map((d, i) => ({ index: i, score: d.score })),
    [data]
  );

  const axisOptions = useMemo(
    () => ({
      formatXLabel: (v: number | string) => {
        const idx = Math.round(Number(v));
        if (idx >= 0 && idx < data.length) {
          const d = new Date(data[idx]!.date);
          return `${d.getDate()}/${d.getMonth() + 1}`;
        }
        return '';
      },
      formatYLabel: (v: number | string) => `${Math.round(Number(v))}`,
      labelColor: tokens.color.text2,
      lineColor: tokens.color.borderSubtle,
    }),
    [data]
  );

  return (
    <View style={styles.container}>
      <CartesianChart
        data={chartData}
        xKey="index"
        yKeys={['score']}
        domain={{ y: [0, 100] }}
        axisOptions={axisOptions}
      >
        {({ points }) => (
          <Line
            points={points.score}
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
});
