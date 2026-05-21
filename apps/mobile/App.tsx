import './src/sentry/init';
import * as Sentry from '@sentry/react-native';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/services/queryClient';
import { AuthProvider } from './src/hooks/useAuth';
import { DeviceProvider } from './src/contexts/DeviceContext';
import RootNavigator from './src/navigation/RootNavigator';
import './src/i18n';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DeviceProvider>
          <RootNavigator />
        </DeviceProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(App);
