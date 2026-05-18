export type ScanResult = { name: string; identifier: string; rssi: number };
export type ManifestEntry = { index: number; address: number; fingerprintHex: string; firmwareVersion?: string };
export type DownloadProgress = { bytesReceived: number; bytesExpected: number | null };

export type DeviceInfo = {
  /** BLE-advertised GAP name from the peripheral; null if unavailable
   *  (e.g. some restored CoreBluetooth connection paths on iOS). */
  scanName: string | null;
  /** Hex-encoded serial bytes from RDBI ID_SERIAL — lowercase, no
   *  separators. Used as the device's primary key in user_devices on
   *  the backend. Stable across firmware formatting differences. */
  serial: string;
  /** ASCII-decoded firmware version string from RDBI ID_FIRMWARE,
   *  trimmed of whitespace. null if the bytes aren't valid ASCII. */
  firmwareVersion: string | null;
};

export interface DiveComputerModule {
  startScan(serviceUuid: string): Promise<void>;
  stopScan(): Promise<void>;
  connect(identifier: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  /** Returns identifying facts about the connected device. Must be called
   *  after connect() and before any other Layer-3 method. */
  getDeviceInfo(): Promise<DeviceInfo>;
  listDives(): Promise<ManifestEntry[]>;
  downloadDive(index: number): Promise<{ rawBytes: string }>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}
