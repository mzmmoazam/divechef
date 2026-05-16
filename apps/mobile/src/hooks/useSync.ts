import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DiveComputerNative } from '../native';
import { addDiveComputerListener } from '../native/events';
import type { ScanResult, DownloadProgress } from '../native/DiveComputer';
import { api } from '../services/api';
import { enqueueUpload } from '../services/queue';
import { getSyncedFingerprints, markFingerprintSynced } from '../services/syncedDives';
import { useAuth } from './useAuth';

const SERVICE_UUID = 'FE25C237-0ECE-443C-B0AA-E02033E7029D';

export type SyncState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'listing'
  | 'downloading'
  | 'uploading'
  | 'complete'
  | 'error';

export function useSync() {
  const [state, setState] = useState<SyncState>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);
  const [currentDiveIndex, setCurrentDiveIndex] = useState(0);
  const [totalDives, setTotalDives] = useState(0);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const abortRef = useRef(false);
  const discoveryUnsubRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    const unsub = addDiveComputerListener('diveComputerDiscovered', (device) => {
      setDiscoveredDevices((prev) => {
        if (prev.find((d) => d.identifier === device.identifier)) return prev;
        return [...prev, device];
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = addDiveComputerListener('diveComputerProgress', (p) => {
      setProgress(p);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = addDiveComputerListener('diveComputerDisconnected', ({ reason }) => {
      setState((current) => {
        if (current === 'downloading' || current === 'uploading') {
          setError(reason || 'ble_connection_lost');
          return 'error';
        }
        if (current === 'scanning' || current === 'connecting') {
          setError(reason || 'no_device');
          return 'error';
        }
        return current;
      });
    });
    return unsub;
  }, []);

  const startSync = useCallback(async () => {
    abortRef.current = false;
    setError(null);
    setSyncedCount(0);
    setCurrentDiveIndex(0);
    setTotalDives(0);
    setDiscoveredDevices([]);

    // Defensive guard for an unreachable state — Sync screen sits behind
    // auth in the nav stack. The error code 'unauthenticated' is intentionally
    // not in SyncScreen's i18n map; it falls through to t('common.error').
    if (!user?.id) {
      setState('error');
      setError('unauthenticated');
      return;
    }
    // Capture once for the duration of the sync so a mid-sync logout can't
    // cause in-flight markFingerprintSynced/enqueueUpload calls to attribute
    // the upload to a different user than the one whose token authenticated it.
    const userId = user.id;

    try {
      setState('scanning');
      await DiveComputerNative.startScan(SERVICE_UUID);

      // Wait for first discovered device (up to 10s)
      let discoveryUnsub: (() => void) | undefined;
      const device = await new Promise<ScanResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          discoveryUnsub?.();
          discoveryUnsubRef.current = undefined;
          reject(new Error('no_device'));
        }, 10000);
        discoveryUnsub = addDiveComputerListener('diveComputerDiscovered', (d) => {
          clearTimeout(timeout);
          discoveryUnsub?.();
          discoveryUnsubRef.current = undefined;
          resolve(d);
        });
        discoveryUnsubRef.current = discoveryUnsub;
      });

      if (abortRef.current) return;

      await DiveComputerNative.stopScan();

      setState('connecting');
      await DiveComputerNative.connect(device.identifier);

      if (abortRef.current) return;

      setState('listing');
      const manifest = await DiveComputerNative.listDives();
      // Fail-open: a DB read error here would leak the BLE connection
      // (caller catch sets state but doesn't disconnect). Treat any
      // syncedDives failure as "nothing known" — the worst case is a
      // re-download of already-uploaded dives, which the server-side
      // dedup-by-fingerprint handles harmlessly.
      const known = await getSyncedFingerprints(userId).catch(() => new Set<string>());
      const newDives = manifest.filter((e) => !known.has(e.fingerprintHex));

      if (newDives.length === 0) {
        await DiveComputerNative.disconnect();
        setState('complete');
        // still trigger the reprocess + invalidations below (unchanged tail)
      } else {
        setTotalDives(newDives.length);
        setState('downloading');
        let synced = 0;

        for (let i = 0; i < newDives.length; i++) {
          if (abortRef.current) break;
          const entry = newDives[i];
          setCurrentDiveIndex(i + 1);

          const { rawBytes } = await DiveComputerNative.downloadDive(entry.index);

          setState('uploading');
          const payload = {
            rawBase64: rawBytes,
            fingerprintHex: entry.fingerprintHex,
            address: entry.address,
          };

          try {
            await api.post('/api/dives', payload, {
              headers: { 'Content-Type': 'application/json' },
            });
            await markFingerprintSynced(userId, entry.fingerprintHex);
            synced++;
            setSyncedCount(synced);
          } catch {
            await enqueueUpload(userId, payload);
          }

          setState('downloading');
        }

        await DiveComputerNative.disconnect();
        setState('complete');
      }

      // Reprocess any dives that were stored before the parser was deployed
      try {
        await api.post('/api/dives/reprocess');
      } catch {}

      queryClient.invalidateQueries({ queryKey: ['diveList'] });
      queryClient.invalidateQueries({ queryKey: ['trends'] });
    } catch (err: unknown) {
      setState('error');
      const message = err instanceof Error ? err.message : 'unknown_error';
      setError(message);
    }
  }, [queryClient, user?.id]);

  const cancel = useCallback(async () => {
    abortRef.current = true;
    discoveryUnsubRef.current?.();
    discoveryUnsubRef.current = undefined;
    await DiveComputerNative.stopScan();
    if (await DiveComputerNative.isConnected()) {
      await DiveComputerNative.disconnect();
    }
    setState('idle');
  }, []);

  return {
    state,
    progress,
    discoveredDevices,
    error,
    syncedCount,
    currentDiveIndex,
    totalDives,
    startSync,
    cancel,
  };
}
