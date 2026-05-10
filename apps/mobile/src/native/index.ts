import { NativeModules } from 'react-native';
import type { DiveComputerModule } from './DiveComputer';

const USE_MOCK = __DEV__ && process.env.EXPO_PUBLIC_USE_MOCK_BLE === 'true';

let module: DiveComputerModule;

if (USE_MOCK) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DiveComputer } = require('./DiveComputer.mock') as {
    DiveComputer: DiveComputerModule;
  };
  module = DiveComputer;
} else {
  module = NativeModules.DiveComputer as DiveComputerModule;
}

export const DiveComputerNative: DiveComputerModule = module;
export type {
  DiveComputerModule,
  ScanResult,
  ManifestEntry,
  DownloadProgress,
} from './DiveComputer';
