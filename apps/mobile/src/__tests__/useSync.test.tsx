import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSync } from '../hooks/useSync';

// Mock the native module
jest.mock('../native', () => ({
  DiveComputerNative: {
    startScan: jest.fn().mockResolvedValue(undefined),
    stopScan: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockResolvedValue(false),
    listDives: jest.fn(),
    downloadDive: jest.fn(),
  },
}));

// Mock event emitter — fire a discovered event immediately when subscribed during scanning.
// Names prefixed with `mock` so jest.mock hoisting allows referencing them in the factory.
let mockDiscoveredHandlers: Array<(d: unknown) => void> = [];
let mockProgressHandlers: Array<(p: unknown) => void> = [];
let mockDisconnectedHandlers: Array<(p: unknown) => void> = [];
jest.mock('../native/events', () => ({
  addDiveComputerListener: (event: string, cb: (d: unknown) => void) => {
    if (event === 'diveComputerDiscovered') mockDiscoveredHandlers.push(cb);
    if (event === 'diveComputerProgress') mockProgressHandlers.push(cb);
    if (event === 'diveComputerDisconnected') mockDisconnectedHandlers.push(cb);
    return () => {
      if (event === 'diveComputerDiscovered') {
        mockDiscoveredHandlers = mockDiscoveredHandlers.filter((h) => h !== cb);
      }
      if (event === 'diveComputerProgress') {
        mockProgressHandlers = mockProgressHandlers.filter((h) => h !== cb);
      }
      if (event === 'diveComputerDisconnected') {
        mockDisconnectedHandlers = mockDisconnectedHandlers.filter((h) => h !== cb);
      }
    };
  },
}));

// Mock api
const mockApiPost = jest.fn();
jest.mock('../services/api', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args) },
}));

// Mock useAuth
const mockUseAuth = jest.fn();
jest.mock('../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock queue
const mockEnqueueUpload = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/queue', () => ({
  enqueueUpload: (userId: string, payload: unknown) => mockEnqueueUpload(userId, payload),
}));

// Mock syncedDives — control the fingerprint set per test
const mockGetSyncedFingerprints = jest.fn();
const mockMarkFingerprintSynced = jest.fn();
jest.mock('../services/syncedDives', () => ({
  getSyncedFingerprints: (userId: string) => mockGetSyncedFingerprints(userId),
  markFingerprintSynced: (userId: string, fp: string) => mockMarkFingerprintSynced(userId, fp),
}));

import { DiveComputerNative } from '../native';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const sampleManifest = [
  { index: 1, address: 0x100, fingerprintHex: 'aaaaaaaa', firmwareVersion: '1.0' },
  { index: 2, address: 0x200, fingerprintHex: 'bbbbbbbb', firmwareVersion: '1.0' },
  { index: 3, address: 0x300, fingerprintHex: 'cccccccc', firmwareVersion: '1.0' },
];

const fireDiscovered = () =>
  mockDiscoveredHandlers.forEach((h) =>
    h({ identifier: 'mock-uuid', name: 'Peregrine', rssi: -50 })
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
  mockDiscoveredHandlers = [];
  mockProgressHandlers = [];
  mockDisconnectedHandlers = [];
  mockApiPost.mockResolvedValue({ data: {} });
  mockGetSyncedFingerprints.mockResolvedValue(new Set<string>());
  mockMarkFingerprintSynced.mockResolvedValue(undefined);
  (DiveComputerNative.listDives as jest.Mock).mockResolvedValue(sampleManifest);
  (DiveComputerNative.downloadDive as jest.Mock).mockResolvedValue({ rawBytes: 'base64' });
});

describe('useSync', () => {
  it('downloads all dives when local fingerprint set is empty', async () => {
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      // Let scan promise register, then fire discovery
      await new Promise((r) => setTimeout(r, 0));
      fireDiscovered();
    });
    await waitFor(() => expect(result.current.state).toBe('complete'));
    expect((DiveComputerNative.downloadDive as jest.Mock).mock.calls.length).toBe(3);
    expect(result.current.syncedCount).toBe(3);
    expect(mockMarkFingerprintSynced).toHaveBeenCalledTimes(3);
    expect(mockMarkFingerprintSynced).toHaveBeenCalledWith('user-1', 'aaaaaaaa');
    expect(mockMarkFingerprintSynced).toHaveBeenCalledWith('user-1', 'bbbbbbbb');
    expect(mockMarkFingerprintSynced).toHaveBeenCalledWith('user-1', 'cccccccc');
  });

  it('fails open when getSyncedFingerprints throws (DB read error)', async () => {
    // Defensive: if the SQLite read fails, the hook should treat the
    // known set as empty and download everything. The catch in the
    // hook (useSync.ts) protects against a leaked BLE connection.
    mockGetSyncedFingerprints.mockRejectedValue(new Error('db read failed'));
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      await new Promise((r) => setTimeout(r, 0));
      fireDiscovered();
    });
    await waitFor(() => expect(result.current.state).toBe('complete'));
    expect((DiveComputerNative.downloadDive as jest.Mock).mock.calls.length).toBe(3);
    expect(result.current.syncedCount).toBe(3);
  });

  it('skips already-synced dives', async () => {
    mockGetSyncedFingerprints.mockResolvedValue(new Set(['aaaaaaaa', 'cccccccc']));
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      await new Promise((r) => setTimeout(r, 0));
      fireDiscovered();
    });
    await waitFor(() => expect(result.current.state).toBe('complete'));
    expect((DiveComputerNative.downloadDive as jest.Mock).mock.calls.length).toBe(1);
    expect((DiveComputerNative.downloadDive as jest.Mock).mock.calls[0][0]).toBe(2); // index of 'bbbbbbbb'
    expect(result.current.syncedCount).toBe(1);
    expect(mockMarkFingerprintSynced).toHaveBeenCalledTimes(1);
    expect(mockMarkFingerprintSynced).toHaveBeenCalledWith('user-1', 'bbbbbbbb');
  });

  it('goes straight to complete with 0 synced when all dives are already known', async () => {
    mockGetSyncedFingerprints.mockResolvedValue(
      new Set(['aaaaaaaa', 'bbbbbbbb', 'cccccccc'])
    );
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      await new Promise((r) => setTimeout(r, 0));
      fireDiscovered();
    });
    await waitFor(() => expect(result.current.state).toBe('complete'));
    expect((DiveComputerNative.downloadDive as jest.Mock).mock.calls.length).toBe(0);
    expect(result.current.syncedCount).toBe(0);
    expect(mockMarkFingerprintSynced).not.toHaveBeenCalled();
  });

  it('does NOT mark fingerprint synced when upload is queued (api fails)', async () => {
    mockApiPost.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      await new Promise((r) => setTimeout(r, 0));
      fireDiscovered();
    });
    await waitFor(() => expect(result.current.state).toBe('complete'));
    expect((DiveComputerNative.downloadDive as jest.Mock).mock.calls.length).toBe(3);
    // syncedCount counts API successes only
    expect(result.current.syncedCount).toBe(0);
    expect(mockMarkFingerprintSynced).not.toHaveBeenCalled();
    expect(mockEnqueueUpload).toHaveBeenCalledTimes(3);
    expect(mockEnqueueUpload).toHaveBeenCalledWith('user-1', expect.any(Object));
  });

  it('exposes currentDiveIndex and totalDives during download', async () => {
    let resolveDownload: (v: { rawBytes: string }) => void = () => undefined;
    (DiveComputerNative.downloadDive as jest.Mock).mockImplementationOnce(() =>
      new Promise<{ rawBytes: string }>((r) => { resolveDownload = r; })
    );
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      await new Promise((r) => setTimeout(r, 0));
      fireDiscovered();
    });
    // Wait for the hook to reach the downloading state with the first dive in flight.
    await waitFor(() => expect(result.current.state).toBe('downloading'));
    expect(result.current.totalDives).toBe(3);
    expect(result.current.currentDiveIndex).toBe(1);

    // Let the first download complete, allow the rest to flow.
    await act(async () => {
      resolveDownload({ rawBytes: 'base64' });
    });
    await waitFor(() => expect(result.current.state).toBe('complete'));
  });

  it('sets unauthenticated error when user.id is null', async () => {
    // Auth guard short-circuits before startScan, so no discovery handler
    // is ever registered — fireDiscovered() is intentionally not called.
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => {
      result.current.startSync();
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.error).toBe('unauthenticated');
  });
});
