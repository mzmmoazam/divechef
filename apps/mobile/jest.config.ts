import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|expo-.*|@expo|victory-native|react-native-svg|i18next|react-i18next)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@diveforge/shared/(.*)$': '<rootDir>/../../packages/shared/dist/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};

export default config;
