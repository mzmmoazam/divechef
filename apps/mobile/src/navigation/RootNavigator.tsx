import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import DiveDetailScreen from '../screens/DiveDetailScreen';
import SyncScreen from '../screens/SyncScreen';
import AddDeviceScreen from '../screens/AddDeviceScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer key={isAuthenticated ? 'authed' : 'guest'}>
      {isAuthenticated ? (
        <Stack.Navigator>
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="DiveDetail" component={DiveDetailScreen} options={{ title: '' }} />
          <Stack.Screen name="Sync" component={SyncScreen} options={{ title: '' }} />
          <Stack.Screen name="AddDevice" component={AddDeviceScreen} options={{ title: 'Add device' }} />
        </Stack.Navigator>
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}
