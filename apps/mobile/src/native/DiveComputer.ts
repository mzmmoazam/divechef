export type ScanResult = { name: string; identifier: string; rssi: number };
export type ManifestEntry = { index: number; address: number; fingerprintHex: string };
export type DownloadProgress = { bytesReceived: number; bytesExpected: number | null };

export interface DiveComputerModule {
  startScan(serviceUuid: string): Promise<void>;
  stopScan(): Promise<void>;
  connect(identifier: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  listDives(): Promise<ManifestEntry[]>;
  downloadDive(index: number): Promise<{ rawBytes: string }>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}
