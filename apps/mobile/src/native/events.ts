import type { ScanResult, DownloadProgress } from './DiveComputer';

type DiveComputerEventMap = {
  diveComputerDiscovered: ScanResult;
  diveComputerProgress: DownloadProgress;
  diveComputerDisconnected: { reason: string };
};

type EventName = keyof DiveComputerEventMap;

function getEventTarget() {
  const USE_REAL_BLE = process.env.EXPO_PUBLIC_USE_REAL_BLE === 'true';
  if (USE_REAL_BLE) {
    throw new Error('Real BLE event system not yet available.');
  }
  const { mockEventTarget } = require('./DiveComputer.mock');
  return mockEventTarget;
}

export function addDiveComputerListener<E extends EventName>(
  event: E,
  callback: (payload: DiveComputerEventMap[E]) => void
): () => void {
  const target = getEventTarget();
  target.on(event, callback as (p: unknown) => void);
  return () => {
    target.off(event, callback as (p: unknown) => void);
  };
}
