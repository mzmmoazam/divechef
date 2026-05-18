import { FIXTURE_DIVES } from './fixtures';
import type {
  ScanResult,
  ManifestEntry,
  DownloadProgress,
  DeviceInfo,
  DiveComputerModule,
} from './DiveComputer';

type EventCallback = (payload: unknown) => void;

class MockDiveComputerModule implements DiveComputerModule {
  private connected = false;
  private scanning = false;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  async startScan(_serviceUuid: string): Promise<void> {
    this.scanning = true;
    this.scanTimer = setTimeout(() => {
      if (this.scanning) {
        mockEventTarget.emit('diveComputerDiscovered', {
          name: 'Peregrine-MOCK',
          identifier: 'MOCK-BLE-001',
          rssi: -62,
        } satisfies ScanResult);
      }
    }, 1500);
  }

  async stopScan(): Promise<void> {
    this.scanning = false;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  async connect(_identifier: string): Promise<void> {
    await this.delay(800);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    mockEventTarget.emit('diveComputerDisconnected', { reason: 'user_requested' });
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    if (!this.connected) throw new Error('Not connected');
    return {
      scanName: 'Peregrine-MOCK',
      serial: 'mock0001a1b2c3d4',
      firmwareVersion: 'MOCK-1.0',
    };
  }

  async listDives(): Promise<ManifestEntry[]> {
    if (!this.connected) throw new Error('Not connected');
    await this.delay(500);
    return FIXTURE_DIVES.map((_, idx) => ({
      index: idx,
      address: 0x1000 + idx * 0x1000,
      fingerprintHex: `MOCK${String(idx).padStart(4, '0')}`,
    }));
  }

  async downloadDive(index: number): Promise<{ rawBytes: string }> {
    if (!this.connected) throw new Error('Not connected');
    if (index < 0 || index >= FIXTURE_DIVES.length) {
      throw new Error(`Invalid dive index: ${index}`);
    }

    const fixture = FIXTURE_DIVES[index];
    const jsonBytes = JSON.stringify(fixture);
    const totalBytes = jsonBytes.length;

    const chunks = 5;
    for (let i = 1; i <= chunks; i++) {
      await this.delay(300);
      mockEventTarget.emit('diveComputerProgress', {
        bytesReceived: Math.round((i / chunks) * totalBytes),
        bytesExpected: totalBytes,
      } satisfies DownloadProgress);
    }

    // Use btoa for base64 encoding (available in RN Hermes)
    const base64 = btoa(jsonBytes);
    return { rawBytes: base64 };
  }

  addListener(_eventName: string): void {}
  removeListeners(_count: number): void {}

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

class MockEventTarget {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, cb: EventCallback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  off(event: string, cb: EventCallback) {
    this.listeners.get(event)?.delete(cb);
  }

  emit(event: string, payload: unknown) {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }
}

export const mockEventTarget = new MockEventTarget();
export const DiveComputer: DiveComputerModule = new MockDiveComputerModule();
