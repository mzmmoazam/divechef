import { NativeModules } from 'react-native';
import type { DiveComputerModule } from './DiveComputer';

const nativeModule = NativeModules.DiveComputer as DiveComputerModule | undefined;
const USE_MOCK =
  process.env.EXPO_PUBLIC_USE_MOCK_BLE === 'true' ||
  (__DEV__ && !nativeModule);

let module: DiveComputerModule;

if (USE_MOCK) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DiveComputer } = require('./DiveComputer.mock') as {
    DiveComputer: DiveComputerModule;
  };
  module = DiveComputer;
} else {
  module = nativeModule!;
}

export const DiveComputerNative: DiveComputerModule = module;
export type {
  DiveComputerModule,
  ScanResult,
  ManifestEntry,
  DownloadProgress,
} from './DiveComputer';
