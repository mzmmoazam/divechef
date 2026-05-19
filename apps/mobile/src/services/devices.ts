import { api } from './api';
import type { Device } from '../contexts/DeviceContext';

export async function fetchDevices(): Promise<Device[]> {
  const res = await api.get<{ devices: Device[] }>('/api/devices');
  return res.data.devices;
}

export type RegisterDeviceInput = {
  model: string;
  serialNumber: string;
  scanName?: string | null;
  firmwareVersion?: string | null;
  friendlyName?: string | null;
};

export async function registerDevice(input: RegisterDeviceInput): Promise<Device> {
  const res = await api.post<{ device: Device }>('/api/devices', input);
  return res.data.device;
}

export async function renameDevice(id: string, friendlyName: string): Promise<Device> {
  const res = await api.patch<{ device: Device }>(`/api/devices/${id}`, { friendlyName });
  return res.data.device;
}

export async function deleteDevice(id: string): Promise<void> {
  await api.delete(`/api/devices/${id}`);
}
