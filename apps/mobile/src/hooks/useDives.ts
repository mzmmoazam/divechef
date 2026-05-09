import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Dive, DiveSummary, DiveSample, Insight } from '@diveforge/shared/types';

export function useDiveList(limit = 20) {
  return useInfiniteQuery({
    queryKey: ['dives', limit],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<{ dives: DiveSummary[]; nextCursor: string | null }>(
        '/api/dives',
        { params: { limit, cursor: pageParam } }
      );
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useDiveDetail(id: string) {
  return useQuery({
    queryKey: ['dives', id],
    queryFn: async () => {
      const { data } = await api.get<{ dive: Dive; insights: Insight[] }>(`/api/dives/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useDiveSamples(id: string, enabled = true) {
  return useQuery({
    queryKey: ['dives', id, 'samples'],
    queryFn: async () => {
      const { data } = await api.get<{ samples: DiveSample[] }>(`/api/dives/${id}/samples`);
      return data.samples;
    },
    enabled: !!id && enabled,
  });
}
