import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { getPendingCount, flushQueue } from '../services/queue';
import { api } from '../services/api';

async function uploadDive(payload: unknown): Promise<boolean> {
  try {
    const response = await api.post('/api/dives', payload);
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

export function useQueueFlush() {
  const [pendingCount, setPendingCount] = useState(0);
  const appStateRef = useRef(AppState.currentState);

  const refreshCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  const flush = useCallback(async () => {
    await flushQueue(uploadDive);
    await refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        flush();
      }
      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, [flush]);

  return { pendingCount, flush };
}
