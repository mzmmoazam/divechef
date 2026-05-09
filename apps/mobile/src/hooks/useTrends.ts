import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

interface TrendsData {
  avgScore: number;
  avgDepthM: number;
  diveCount: number;
  scoreSeries: { date: string; score: number }[];
  summaryTipKey: string;
}

export function useTrends(days = 30) {
  return useQuery({
    queryKey: ['trends', days],
    queryFn: async () => {
      const { data } = await api.get<TrendsData>('/api/trends', { params: { days } });
      return data;
    },
  });
}
