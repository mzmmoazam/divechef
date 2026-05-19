import { fetchDevices, registerDevice, renameDevice, deleteDevice } from '../devices';
import { api } from '../api';

jest.mock('../api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedApi = api as jest.Mocked<typeof api>;

const sampleDevice = {
  id: 'id-1',
  model: 'peregrine' as const,
  serialNumber: 'sn-A',
  friendlyName: 'Peregrine',
  scanName: 'Peregrine 1234',
  firmwareVersion: '95',
  registeredAt: '2026-05-19T00:00:00Z',
  lastSyncAt: null,
};

describe('devices service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetchDevices GETs /api/devices and unwraps the array', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { devices: [sampleDevice] } } as any);
    const result = await fetchDevices();
    expect(mockedApi.get).toHaveBeenCalledWith('/api/devices');
    expect(result).toEqual([sampleDevice]);
  });

  it('fetchDevices returns [] when server has no devices', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { devices: [] } } as any);
    expect(await fetchDevices()).toEqual([]);
  });

  it('registerDevice POSTs to /api/devices with the input body', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { device: sampleDevice } } as any);
    const result = await registerDevice({
      model: 'peregrine',
      serialNumber: 'sn-A',
      scanName: 'Peregrine 1234',
      firmwareVersion: '95',
    });
    expect(mockedApi.post).toHaveBeenCalledWith('/api/devices', {
      model: 'peregrine',
      serialNumber: 'sn-A',
      scanName: 'Peregrine 1234',
      firmwareVersion: '95',
    });
    expect(result).toEqual(sampleDevice);
  });

  it('renameDevice PATCHes /api/devices/:id with friendlyName', async () => {
    const renamed = { ...sampleDevice, friendlyName: 'My P' };
    mockedApi.patch.mockResolvedValueOnce({ data: { device: renamed } } as any);
    const result = await renameDevice('id-1', 'My P');
    expect(mockedApi.patch).toHaveBeenCalledWith('/api/devices/id-1', { friendlyName: 'My P' });
    expect(result).toEqual(renamed);
  });

  it('deleteDevice DELETEs /api/devices/:id', async () => {
    mockedApi.delete.mockResolvedValueOnce({ data: { ok: true } } as any);
    await deleteDevice('id-1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/api/devices/id-1');
  });

  it('propagates errors from the API client', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('network'));
    await expect(fetchDevices()).rejects.toThrow('network');
  });
});
