import type { DiveComputerModule } from './DiveComputer';

const USE_REAL_BLE = process.env.EXPO_PUBLIC_USE_REAL_BLE === 'true';

let module: DiveComputerModule;

if (USE_REAL_BLE) {
  throw new Error(
    'Real BLE module not yet available. Set EXPO_PUBLIC_USE_REAL_BLE=false or implement Plan 3.'
  );
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DiveComputer } = require('./DiveComputer.mock') as {
    DiveComputer: DiveComputerModule;
  };
  module = DiveComputer;
}

export const DiveComputerNative: DiveComputerModule = module;
export type {
  DiveComputerModule,
  ScanResult,
  ManifestEntry,
  DownloadProgress,
} from './DiveComputer';
