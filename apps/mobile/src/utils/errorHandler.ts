import { Linking, Platform } from 'react-native';

export type AppErrorType =
  | 'ble_no_device'
  | 'ble_connection_lost'
  | 'ble_permission_denied'
  | 'network_unavailable'
  | 'auth_expired'
  | 'parse_failed'
  | 'unknown';

export function classifyError(error: unknown): AppErrorType {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('no_device')) return 'ble_no_device';
    if (msg.includes('disconnected') || msg.includes('connection_lost'))
      return 'ble_connection_lost';
    if (msg.includes('permission')) return 'ble_permission_denied';
    if (msg.includes('network') || msg.includes('timeout'))
      return 'network_unavailable';
    if (msg.includes('401') || msg.includes('unauthorized'))
      return 'auth_expired';
    if (msg.includes('parse')) return 'parse_failed';
  }
  return 'unknown';
}

export function getErrorI18nKey(errorType: AppErrorType): string {
  switch (errorType) {
    case 'ble_no_device':
      return 'sync.noDevice';
    case 'ble_connection_lost':
      return 'sync.connectionLost';
    case 'ble_permission_denied':
      return 'sync.permissionDenied';
    case 'network_unavailable':
      return 'queue.pending';
    case 'auth_expired':
      return 'common.error';
    case 'parse_failed':
      return 'common.error';
    default:
      return 'common.error';
  }
}

export function openBleSettings(): void {
  if (Platform.OS === 'ios') {
    Linking.openURL('app-settings:');
  } else {
    Linking.openSettings();
  }
}
