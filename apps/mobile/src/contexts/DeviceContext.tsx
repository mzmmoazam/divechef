import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { ShearwaterModel } from '@divechef/shared';

export type Device = {
  id: string;
  model: ShearwaterModel;
  serialNumber: string;
  friendlyName: string | null;
  scanName: string | null;
  firmwareVersion: string | null;
  registeredAt: string;
  lastSyncAt: string | null;
};

type DeviceCtx = {
  devices: Device[];
  selectedDeviceSerial: string | null;
  setActive: (serialNumber: string | null) => void;
  setDevices: (devices: Device[]) => void;
  addDevice: (device: Device) => void;
  updateDevice: (id: string, patch: Partial<Device>) => void;
  removeDevice: (id: string) => void;
};

const Context = createContext<DeviceCtx | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [devices, setDevicesState] = useState<Device[]>([]);
  const [selectedDeviceSerial, setSelectedDeviceSerial] = useState<string | null>(null);

  const setDevices = useCallback((next: Device[]) => {
    setDevicesState(next);
    if (selectedDeviceSerial == null && next.length === 1) {
      setSelectedDeviceSerial(next[0].serialNumber);
    }
    if (selectedDeviceSerial != null && !next.some((d) => d.serialNumber === selectedDeviceSerial)) {
      setSelectedDeviceSerial(null);
    }
  }, [selectedDeviceSerial]);

  const addDevice = useCallback((device: Device) => {
    setDevicesState((prev) => {
      if (prev.some((d) => d.id === device.id)) return prev;
      return [...prev, device];
    });
    setSelectedDeviceSerial((prev) => prev ?? device.serialNumber);
  }, []);

  const updateDevice = useCallback((id: string, patch: Partial<Device>) => {
    setDevicesState((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const removeDevice = useCallback((id: string) => {
    setDevicesState((prev) => {
      const filtered = prev.filter((d) => d.id !== id);
      const removed = prev.find((d) => d.id === id);
      if (removed && selectedDeviceSerial === removed.serialNumber) {
        setSelectedDeviceSerial(filtered[0]?.serialNumber ?? null);
      }
      return filtered;
    });
  }, [selectedDeviceSerial]);

  return (
    <Context.Provider value={{
      devices,
      selectedDeviceSerial,
      setActive: setSelectedDeviceSerial,
      setDevices,
      addDevice,
      updateDevice,
      removeDevice,
    }}>
      {children}
    </Context.Provider>
  );
}

export function useActiveDevice(): DeviceCtx {
  const v = useContext(Context);
  if (!v) throw new Error('useActiveDevice must be used inside DeviceProvider');
  return v;
}
