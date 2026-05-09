import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CartesianChart, Line } from 'victory-native';

interface ScoreTrendChartProps {
  data: { date: string; score: number }[];
}

export function ScoreTrendChart({ data }: ScoreTrendChartProps) {
  const chartData = data.map((d, i) => ({
    index: i,
    score: d.score,
  }));

  return (
    <View style={styles.container}>
      <CartesianChart
        data={chartData}
        xKey="index"
        yKeys={['score']}
        domain={{ y: [0, 100] }}
        axisOptions={{
          formatXLabel: (v) => {
            const idx = Math.round(Number(v));
            if (idx >= 0 && idx < data.length) {
              const d = new Date(data[idx]!.date);
              return `${d.getDate()}/${d.getMonth() + 1}`;
            }
            return '';
          },
          formatYLabel: (v) => `${Math.round(Number(v))}`,
        }}
      >
        {({ points }) => (
          <Line
            points={points.score}
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
});
