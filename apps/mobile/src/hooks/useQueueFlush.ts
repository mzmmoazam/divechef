import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { getPendingCount, flushQueue } from '../services/queue';
import { api } from '../services/api';
import { useAuth } from './useAuth';
import { useActiveDevice } from '../contexts/DeviceContext';

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
  const { selectedDeviceSerial: deviceSerial } = useActiveDevice();

  const refreshCount = useCallback(async () => {
    // No device selected (P1 not wired yet, or user logged out): show zero
    // pending and skip the DB read. Same defensive pattern as the userId
    // guard — both must be present before queue ops are valid.
    if (!userId || !deviceSerial) {
      setPendingCount(0);
      return;
    }
    const count = await getPendingCount(userId, deviceSerial);
    setPendingCount(count);
  }, [userId, deviceSerial]);

  const flush = useCallback(async () => {
    if (!userId || !deviceSerial) return;
    if (isFlushing.current) return;
    isFlushing.current = true;
    try {
      await flushQueue(userId, deviceSerial, uploadDive);
      await refreshCount();
    } finally {
      isFlushing.current = false;
    }
  }, [refreshCount, userId, deviceSerial]);

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
