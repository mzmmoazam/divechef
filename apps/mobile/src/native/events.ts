import { mockEventTarget } from './DiveComputer.mock';
import type { ScanResult, DownloadProgress } from './DiveComputer';

type DiveComputerEventMap = {
  diveComputerDiscovered: ScanResult;
  diveComputerProgress: DownloadProgress;
  diveComputerDisconnected: { reason: string };
};

type EventName = keyof DiveComputerEventMap;

export function addDiveComputerListener<E extends EventName>(
  event: E,
  callback: (payload: DiveComputerEventMap[E]) => void
): () => void {
  mockEventTarget.on(event, callback as (p: unknown) => void);
  return () => {
    mockEventTarget.off(event, callback as (p: unknown) => void);
  };
}
