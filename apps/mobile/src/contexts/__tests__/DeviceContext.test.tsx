import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { DeviceProvider, useActiveDevice, type Device } from '../DeviceContext';

const D1: Device = {
  id: 'id-1',
  model: 'peregrine',
  serialNumber: 'sn-A',
  friendlyName: 'Peregrine',
  scanName: null,
  firmwareVersion: null,
  registeredAt: '2026-05-19T00:00:00Z',
  lastSyncAt: null,
};

const D2: Device = {
  id: 'id-2',
  model: 'perdix-ai',
  serialNumber: 'sn-B',
  friendlyName: 'Perdix AI',
  scanName: null,
  firmwareVersion: null,
  registeredAt: '2026-05-19T00:00:00Z',
  lastSyncAt: null,
};

let captured: ReturnType<typeof useActiveDevice> | null = null;

function Probe() {
  captured = useActiveDevice();
  return <Text>{captured.selectedDeviceSerial ?? 'none'}</Text>;
}

function setup() {
  captured = null;
  render(
    <DeviceProvider>
      <Probe />
    </DeviceProvider>,
  );
  return captured!;
}

describe('DeviceContext', () => {
  beforeEach(() => {
    captured = null;
  });

  it('starts empty', () => {
    setup();
    expect(captured!.devices).toEqual([]);
    expect(captured!.selectedDeviceSerial).toBeNull();
  });

  it('addDevice(D1) → length 1, selectedDeviceSerial = D1.serialNumber', () => {
    setup();
    act(() => {
      captured!.addDevice(D1);
    });
    expect(captured!.devices).toHaveLength(1);
    expect(captured!.selectedDeviceSerial).toBe(D1.serialNumber);
  });

  it('addDevice(D1) then addDevice(D2) → length 2, selected stays D1', () => {
    setup();
    act(() => {
      captured!.addDevice(D1);
    });
    act(() => {
      captured!.addDevice(D2);
    });
    expect(captured!.devices).toHaveLength(2);
    expect(captured!.selectedDeviceSerial).toBe(D1.serialNumber);
  });

  it('setActive(D2.serialNumber) after both added → selected becomes D2', () => {
    setup();
    act(() => {
      captured!.addDevice(D1);
    });
    act(() => {
      captured!.addDevice(D2);
    });
    act(() => {
      captured!.setActive(D2.serialNumber);
    });
    expect(captured!.selectedDeviceSerial).toBe(D2.serialNumber);
  });

  it('removeDevice(D2.id) while D2 is active → selected falls back to D1', () => {
    setup();
    act(() => {
      captured!.addDevice(D1);
    });
    act(() => {
      captured!.addDevice(D2);
    });
    act(() => {
      captured!.setActive(D2.serialNumber);
    });
    act(() => {
      captured!.removeDevice(D2.id);
    });
    expect(captured!.devices).toHaveLength(1);
    expect(captured!.selectedDeviceSerial).toBe(D1.serialNumber);
  });

  it('removeDevice(D1.id) while D2 is active → unaffected (still D2)', () => {
    setup();
    act(() => {
      captured!.addDevice(D1);
    });
    act(() => {
      captured!.addDevice(D2);
    });
    act(() => {
      captured!.setActive(D2.serialNumber);
    });
    act(() => {
      captured!.removeDevice(D1.id);
    });
    expect(captured!.devices).toHaveLength(1);
    expect(captured!.selectedDeviceSerial).toBe(D2.serialNumber);
  });

  it('setDevices([]) → selected clears to null', () => {
    setup();
    act(() => {
      captured!.addDevice(D1);
    });
    act(() => {
      captured!.setDevices([]);
    });
    expect(captured!.devices).toHaveLength(0);
    expect(captured!.selectedDeviceSerial).toBeNull();
  });

  it('setDevices([single]) when none selected → auto-selects single', () => {
    setup();
    act(() => {
      captured!.setDevices([D1]);
    });
    expect(captured!.selectedDeviceSerial).toBe(D1.serialNumber);
  });

  describe('useActiveDevice outside provider', () => {
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('throws when rendered outside DeviceProvider', () => {
      expect(() => render(<Probe />)).toThrow(
        /useActiveDevice must be used inside DeviceProvider/,
      );
    });
  });
});
