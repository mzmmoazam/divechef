import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DiveComputerNative } from '../native';
import { addDiveComputerListener } from '../native/events';
import type { ScanResult, DownloadProgress } from '../native/DiveComputer';
import { api } from '../services/api';
import { enqueueUpload } from '../services/queue';

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
  const queryClient = useQueryClient();
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
    const unsub = addDiveComputerListener('diveComputerDisconnected', () => {
      // Only transition to error if we're mid-sync (downloading or uploading)
      setState((current) => {
        if (current === 'downloading' || current === 'uploading') {
          setError('ble_connection_lost');
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
    setDiscoveredDevices([]);

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

      setState('downloading');
      let synced = 0;

      for (const entry of manifest) {
        if (abortRef.current) break;

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
          synced++;
          setSyncedCount(synced);
        } catch {
          await enqueueUpload(payload);
        }

        setState('downloading');
      }

      await DiveComputerNative.disconnect();
      setState('complete');

      queryClient.invalidateQueries({ queryKey: ['diveList'] });
      queryClient.invalidateQueries({ queryKey: ['trends'] });
    } catch (err: unknown) {
      setState('error');
      const message = err instanceof Error ? err.message : 'unknown_error';
      setError(message);
    }
  }, [queryClient]);

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

  return { state, progress, discoveredDevices, error, syncedCount, startSync, cancel };
}
