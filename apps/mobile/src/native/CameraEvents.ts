import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  type EmitterSubscription,
} from 'react-native';

const { DiveChefCameraEvents } = NativeModules;
const emitter =
  Platform.OS === 'ios' ? new NativeEventEmitter(DiveChefCameraEvents) : null;

export type ShutterEvent = { timestamp: number };

const DEBOUNCE_MS = 300;

export const CameraEvents = {
  activate: (): void => {
    if (Platform.OS === 'ios') DiveChefCameraEvents.activate();
  },

  deactivate: (): void => {
    if (Platform.OS === 'ios') DiveChefCameraEvents.deactivate();
  },

  /**
   * Subscribe to shutter press events with 300ms debounce.
   * Rapid presses within the debounce window are dropped.
   */
  onShutterPress: (cb: (event: ShutterEvent) => void): EmitterSubscription => {
    let lastFired = 0;

    const subscription = emitter!.addListener(
      'onShutterPress',
      (event: ShutterEvent) => {
        const now = event.timestamp ?? Date.now();
        if (now - lastFired < DEBOUNCE_MS) return;
        lastFired = now;
        cb(event);
      },
    );

    return subscription;
  },
};
