import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { getPendingCount, flushQueue } from '../services/queue';
import { api } from '../services/api';
import { useAuth } from './useAuth';

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
  const isFlushing = useRef(false);
  const { user } = useAuth();
  const userId = user?.id;

  const refreshCount = useCallback(async () => {
    if (!userId) {
      setPendingCount(0);
      return;
    }
    const count = await getPendingCount(userId);
    setPendingCount(count);
  }, [userId]);

  const flush = useCallback(async () => {
    if (!userId) return;
    if (isFlushing.current) return;
    isFlushing.current = true;
    try {
      await flushQueue(userId, uploadDive);
      await refreshCount();
    } finally {
      isFlushing.current = false;
    }
  }, [refreshCount, userId]);

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
