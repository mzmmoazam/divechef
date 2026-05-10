import { NativeModules, NativeEventEmitter } from 'react-native';
import type { ScanResult, DownloadProgress } from './DiveComputer';

type DiveComputerEventMap = {
  diveComputerDiscovered: ScanResult;
  diveComputerProgress: DownloadProgress;
  diveComputerDisconnected: { reason: string };
};

type EventName = keyof DiveComputerEventMap;

const nativeModule = NativeModules.DiveComputer;
const USE_MOCK =
  process.env.EXPO_PUBLIC_USE_MOCK_BLE === 'true' ||
  (__DEV__ && !nativeModule);

function getEventEmitter() {
  if (USE_MOCK) {
    const { mockEventTarget } = require('./DiveComputer.mock');
    return mockEventTarget;
  }
  return new NativeEventEmitter(nativeModule);
}

const emitter = getEventEmitter();

export function addDiveComputerListener<E extends EventName>(
  event: E,
  callback: (payload: DiveComputerEventMap[E]) => void
): () => void {
  if (USE_MOCK) {
    emitter.on(event, callback as (p: unknown) => void);
    return () => {
      emitter.off(event, callback as (p: unknown) => void);
    };
  }
  const subscription = emitter.addListener(event, callback);
  return () => subscription.remove();
}
