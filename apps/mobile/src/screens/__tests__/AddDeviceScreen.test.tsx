import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AddDeviceScreen from '../AddDeviceScreen';

// ---------------------------------------------------------------------------
// Mock: @divechef/shared — provides real-ish parseShearwaterModel + verificationTier
// without resolving the ESM-only src files that Jest can't handle.
// ---------------------------------------------------------------------------
jest.mock('@divechef/shared', () => ({
  parseShearwaterModel: (name: string | null | undefined): string | null => {
    if (!name) return null;
    const trimmed = name.trim().toUpperCase();
    const table: Array<[string, string]> = [
      ['PEREGRINE TX', 'peregrine'], ['PEREGRINE', 'peregrine'],
      ['PERDIX 2', 'perdix-2'], ['PERDIX AI', 'perdix-ai'], ['PERDIX', 'perdix'],
      ['PETREL 3', 'petrel-3'], ['PETREL 2', 'petrel-2'],
      ['TERIC', 'teric'], ['NERD 2', 'nerd-2'], ['TERN TX', 'tern'], ['TERN', 'tern'],
    ];
    for (const [prefix, model] of table) {
      if (!trimmed.startsWith(prefix)) continue;
      const next = trimmed.charAt(prefix.length);
      if (next === '' || /\s/.test(next)) return model;
    }
    return null;
  },
  verificationTier: (model: string): string => {
    if (model === 'peregrine') return 'verified';
    if (model === 'unknown-shearwater') return 'experimental';
    return 'compatible';
  },
}));

// ---------------------------------------------------------------------------
// Mock: native BLE module
// ---------------------------------------------------------------------------
const mockStartScan = jest.fn().mockResolvedValue(undefined);
const mockStopScan = jest.fn().mockResolvedValue(undefined);
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockGetDeviceInfo = jest.fn().mockResolvedValue({
  serial: 'abc123',
  scanName: 'Peregrine 1234',
  firmwareVersion: '1.0.0',
});

jest.mock('../../native', () => ({
  DiveComputerNative: {
    startScan: (...args: unknown[]) => mockStartScan(...args),
    stopScan: (...args: unknown[]) => mockStopScan(...args),
    connect: (...args: unknown[]) => mockConnect(...args),
    disconnect: (...args: unknown[]) => mockDisconnect(...args),
    getDeviceInfo: (...args: unknown[]) => mockGetDeviceInfo(...args),
  },
}));

// ---------------------------------------------------------------------------
// Mock: event listener — captures the callback so tests can fire events
// ---------------------------------------------------------------------------
// Must be prefixed with 'mock' so jest hoisting allows out-of-scope reference.
let mockDiscoveredCallback: ((d: { identifier: string; name?: string | null }) => void) | null = null;

jest.mock('../../native/events', () => ({
  addDiveComputerListener: (event: string, cb: (d: unknown) => void) => {
    if (event === 'diveComputerDiscovered') {
      mockDiscoveredCallback = cb;
    }
    return () => {
      if (event === 'diveComputerDiscovered') mockDiscoveredCallback = null;
    };
  },
}));

// ---------------------------------------------------------------------------
// Mock: registerDevice service
// ---------------------------------------------------------------------------
const mockRegisterDevice = jest.fn().mockResolvedValue({
  id: 'dev-1',
  model: 'peregrine',
  serialNumber: 'abc123',
  friendlyName: "Mo's Peregrine",
  scanName: 'Peregrine 1234',
  firmwareVersion: '1.0.0',
  registeredAt: '2026-05-19T00:00:00Z',
  lastSyncAt: null,
});

jest.mock('../../services/devices', () => ({
  registerDevice: (...args: unknown[]) => mockRegisterDevice(...args),
}));

// ---------------------------------------------------------------------------
// Mock: useAuth
// ---------------------------------------------------------------------------
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { displayName: 'Mo' } }),
}));

// ---------------------------------------------------------------------------
// Mock: DeviceContext
// ---------------------------------------------------------------------------
const mockAddDevice = jest.fn();
jest.mock('../../contexts/DeviceContext', () => ({
  useActiveDevice: () => ({
    devices: [],
    selectedDeviceSerial: null,
    setActive: jest.fn(),
    setDevices: jest.fn(),
    addDevice: mockAddDevice,
    updateDevice: jest.fn(),
    removeDevice: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock: navigation
// ---------------------------------------------------------------------------
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderScreen() {
  return render(<AddDeviceScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDiscoveredCallback = null;
  mockStartScan.mockResolvedValue(undefined);
  mockStopScan.mockResolvedValue(undefined);
  mockConnect.mockResolvedValue(undefined);
  mockDisconnect.mockResolvedValue(undefined);
  mockGetDeviceInfo.mockResolvedValue({
    serial: 'abc123',
    scanName: 'Peregrine 1234',
    firmwareVersion: '1.0.0',
  });
  mockRegisterDevice.mockResolvedValue({
    id: 'dev-1',
    model: 'peregrine',
    serialNumber: 'abc123',
    friendlyName: "Mo's Peregrine",
    scanName: 'Peregrine 1234',
    firmwareVersion: '1.0.0',
    registeredAt: '2026-05-19T00:00:00Z',
    lastSyncAt: null,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AddDeviceScreen', () => {
  it('renders the model picker', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('model-peregrine')).toBeTruthy();
    expect(getByTestId('model-unknown-shearwater')).toBeTruthy();
  });

  it('Peregrine pick + matching advertised name → connect + register', async () => {
    const { getByTestId } = renderScreen();

    // Tap Peregrine row
    fireEvent.press(getByTestId('model-peregrine'));

    // Wait for scan to start and listener to be registered
    await waitFor(() => expect(mockStartScan).toHaveBeenCalledWith(
      'FE25C237-0ECE-443C-B0AA-E02033E7029D'
    ));
    expect(mockDiscoveredCallback).not.toBeNull();

    // Fire discovered event with matching name
    await act(async () => {
      mockDiscoveredCallback!({ identifier: 'p-1', name: 'Peregrine 1234' });
    });

    await waitFor(() => expect(mockConnect).toHaveBeenCalledWith('p-1'));
    await waitFor(() => expect(mockGetDeviceInfo).toHaveBeenCalled());
    await waitFor(() => expect(mockRegisterDevice).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'peregrine', serialNumber: 'abc123' })
    ));
    await waitFor(() => expect(mockAddDevice).toHaveBeenCalled());
  });

  it('Peregrine pick + Teric advertised → mismatch confirmation, user picks Use Teric', async () => {
    mockRegisterDevice.mockResolvedValue({
      id: 'dev-2',
      model: 'teric',
      serialNumber: 'abc123',
      friendlyName: "Mo's Teric",
      scanName: 'Teric 5678',
      firmwareVersion: '2.0.0',
      registeredAt: '2026-05-19T00:00:00Z',
      lastSyncAt: null,
    });

    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('model-peregrine'));

    await waitFor(() => expect(mockStartScan).toHaveBeenCalled());
    expect(mockDiscoveredCallback).not.toBeNull();

    // Fire discovered event — Teric mismatch
    await act(async () => {
      mockDiscoveredCallback!({ identifier: 'p-2', name: 'Teric 5678' });
    });

    // Confirmation dialog should appear with "Use Teric" button
    await waitFor(() => expect(getByTestId('confirm-use-parsed')).toBeTruthy());

    // Tap "Use Teric"
    await act(async () => {
      fireEvent.press(getByTestId('confirm-use-parsed'));
    });

    await waitFor(() => expect(mockRegisterDevice).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'teric' })
    ));
  });

  it('Peregrine pick + Teric advertised → mismatch confirmation, user keeps own pick', async () => {
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('model-peregrine'));

    await waitFor(() => expect(mockStartScan).toHaveBeenCalled());
    expect(mockDiscoveredCallback).not.toBeNull();

    await act(async () => {
      mockDiscoveredCallback!({ identifier: 'p-3', name: 'Teric 5678' });
    });

    await waitFor(() => expect(getByTestId('confirm-keep-picked')).toBeTruthy());

    // Tap "Keep Peregrine"
    await act(async () => {
      fireEvent.press(getByTestId('confirm-keep-picked'));
    });

    await waitFor(() => expect(mockRegisterDevice).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'peregrine' })
    ));
  });

  it('Other Shearwater + Petrel 3 advertised → unknown upgrade confirmation, user picks Use Petrel 3', async () => {
    mockRegisterDevice.mockResolvedValue({
      id: 'dev-3',
      model: 'petrel-3',
      serialNumber: 'abc123',
      friendlyName: "Mo's Petrel 3",
      scanName: 'Petrel 3 9012',
      firmwareVersion: '3.0.0',
      registeredAt: '2026-05-19T00:00:00Z',
      lastSyncAt: null,
    });

    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('model-unknown-shearwater'));

    await waitFor(() => expect(mockStartScan).toHaveBeenCalled());
    expect(mockDiscoveredCallback).not.toBeNull();

    await act(async () => {
      mockDiscoveredCallback!({ identifier: 'p-4', name: 'Petrel 3 9012' });
    });

    // Should show "We recognized your computer" with "Use Petrel 3"
    await waitFor(() => expect(getByTestId('confirm-use-parsed')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId('confirm-use-parsed'));
    });

    await waitFor(() => expect(mockRegisterDevice).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'petrel-3' })
    ));
  });

  it('scan failure → shows error state with retry button', async () => {
    mockStartScan.mockRejectedValue(new Error('BLE unavailable'));

    const { getByTestId, findByText } = renderScreen();

    fireEvent.press(getByTestId('model-peregrine'));

    await findByText('Something went wrong');

    // EmptyState uses onCtaPress — find by label text
    const tryAgainBtn = await findByText('Try again');
    expect(tryAgainBtn).toBeTruthy();

    await act(async () => {
      fireEvent.press(tryAgainBtn);
    });

    // Should be back on pick step
    await waitFor(() => expect(getByTestId('model-peregrine')).toBeTruthy());
  });
});
