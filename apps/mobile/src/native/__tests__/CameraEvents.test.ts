/**
 * Tests for CameraEvents TS wrapper — specifically the 300ms debounce logic.
 *
 * We avoid mocking the entire 'react-native' module (which triggers
 * TurboModule resolution errors). Instead we mock only the specific
 * imports used by CameraEvents.ts.
 */

const mockActivate = jest.fn();
const mockDeactivate = jest.fn();
const mockAddListener = jest.fn();
const mockRemove = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: {
    DiveChefCameraEvents: {
      activate: jest.fn(),
      deactivate: jest.fn(),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
  })),
  Platform: { OS: 'ios' },
}));

// Re-import after mocks are set up
import { NativeModules, NativeEventEmitter } from 'react-native';

// Patch the mocks so we can control them per-test
beforeEach(() => {
  jest.clearAllMocks();
  mockActivate.mockReset();
  mockDeactivate.mockReset();
  mockAddListener.mockReset();
  mockRemove.mockReset();

  (NativeModules.DiveChefCameraEvents as any).activate = mockActivate;
  (NativeModules.DiveChefCameraEvents as any).deactivate = mockDeactivate;

  // Re-wire the NativeEventEmitter mock
  (NativeEventEmitter as unknown as jest.Mock).mockImplementation(() => ({
    addListener: mockAddListener,
  }));
});

// We need to re-require CameraEvents for each test group because the module
// caches the emitter on first load. Use isolateModules for fresh imports.
function loadCameraEvents() {
  let mod: typeof import('../CameraEvents');
  jest.isolateModules(() => {
    mod = require('../CameraEvents');
  });
  return mod!;
}

describe('CameraEvents', () => {
  describe('activate / deactivate', () => {
    it('calls native activate on iOS', () => {
      const { CameraEvents } = loadCameraEvents();
      CameraEvents.activate();
      expect(mockActivate).toHaveBeenCalledTimes(1);
    });

    it('calls native deactivate on iOS', () => {
      const { CameraEvents } = loadCameraEvents();
      CameraEvents.deactivate();
      expect(mockDeactivate).toHaveBeenCalledTimes(1);
    });
  });

  describe('onShutterPress debounce', () => {
    it('fires callback on first event', () => {
      const cb = jest.fn();
      let capturedHandler: (event: { timestamp: number }) => void;

      mockAddListener.mockImplementation((_name: string, handler: any) => {
        capturedHandler = handler;
        return { remove: mockRemove };
      });

      const { CameraEvents } = loadCameraEvents();
      CameraEvents.onShutterPress(cb);

      capturedHandler!({ timestamp: 1000 });
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith({ timestamp: 1000 });
    });

    it('drops second event within 300ms debounce window', () => {
      const cb = jest.fn();
      let capturedHandler: (event: { timestamp: number }) => void;

      mockAddListener.mockImplementation((_name: string, handler: any) => {
        capturedHandler = handler;
        return { remove: mockRemove };
      });

      const { CameraEvents } = loadCameraEvents();
      CameraEvents.onShutterPress(cb);

      // Fire first event
      capturedHandler!({ timestamp: 1000 });
      expect(cb).toHaveBeenCalledTimes(1);

      // Fire second event within 300ms
      capturedHandler!({ timestamp: 1200 });
      expect(cb).toHaveBeenCalledTimes(1); // Still 1 — debounced

      // Fire third event at exactly 299ms (not enough)
      capturedHandler!({ timestamp: 1299 });
      expect(cb).toHaveBeenCalledTimes(1); // Still 1
    });

    it('fires callback again after 300ms has passed', () => {
      const cb = jest.fn();
      let capturedHandler: (event: { timestamp: number }) => void;

      mockAddListener.mockImplementation((_name: string, handler: any) => {
        capturedHandler = handler;
        return { remove: mockRemove };
      });

      const { CameraEvents } = loadCameraEvents();
      CameraEvents.onShutterPress(cb);

      // First event
      capturedHandler!({ timestamp: 1000 });
      expect(cb).toHaveBeenCalledTimes(1);

      // Second event after 300ms
      capturedHandler!({ timestamp: 1300 });
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('handles rapid triple-press correctly (only 1 event)', () => {
      const cb = jest.fn();
      let capturedHandler: (event: { timestamp: number }) => void;

      mockAddListener.mockImplementation((_name: string, handler: any) => {
        capturedHandler = handler;
        return { remove: mockRemove };
      });

      const { CameraEvents } = loadCameraEvents();
      CameraEvents.onShutterPress(cb);

      // Rapid triple press — 100ms apart
      capturedHandler!({ timestamp: 5000 });
      capturedHandler!({ timestamp: 5100 });
      capturedHandler!({ timestamp: 5200 });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith({ timestamp: 5000 });
    });

    it('allows multiple events spaced > 300ms apart', () => {
      const cb = jest.fn();
      let capturedHandler: (event: { timestamp: number }) => void;

      mockAddListener.mockImplementation((_name: string, handler: any) => {
        capturedHandler = handler;
        return { remove: mockRemove };
      });

      const { CameraEvents } = loadCameraEvents();
      CameraEvents.onShutterPress(cb);

      capturedHandler!({ timestamp: 1000 });
      capturedHandler!({ timestamp: 1400 }); // 400ms later — allowed
      capturedHandler!({ timestamp: 1800 }); // 400ms later — allowed

      expect(cb).toHaveBeenCalledTimes(3);
    });

    it('returns a subscription with remove()', () => {
      mockAddListener.mockReturnValue({ remove: mockRemove });

      const { CameraEvents } = loadCameraEvents();
      const subscription = CameraEvents.onShutterPress(jest.fn());

      expect(subscription).toHaveProperty('remove');
      subscription.remove();
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });
  });
});
