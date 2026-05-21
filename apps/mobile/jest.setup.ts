import * as React from 'react';

// Skip @testing-library/react-native's strict peer-dep check.
// Workspace resolution can hoist a newer react-test-renderer (19.2.x) than the
// library's hard-coded expectation (matching react@19.1.0). The runtime is
// compatible; the check is overly strict.
process.env.RNTL_SKIP_DEPS_CHECK = '1';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    execAsync: jest.fn(),
    runAsync: jest.fn(),
    getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
    getAllAsync: jest.fn().mockResolvedValue([]),
  }),
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'fr' }],
}));

jest.mock('victory-native', () => ({
  CartesianChart: 'CartesianChart',
  Line: 'Line',
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Circle: 'Circle',
  Rect: 'Rect',
  Path: 'Path',
  G: 'G',
  Text: 'Text',
  Line: 'Line',
}));

// Sentry: mock the native SDK in tests so init/capture calls are no-ops.
// Real init runs only on device via EAS-built binaries.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: <T extends React.ComponentType<unknown>>(component: T): T => component,
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
}));
