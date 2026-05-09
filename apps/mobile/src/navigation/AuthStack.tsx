import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import NiveauPickerScreen from '../screens/NiveauPickerScreen';
import DisclaimerScreen from '../screens/DisclaimerScreen';
import BlePermissionScreen from '../screens/BlePermissionScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="NiveauPicker" component={NiveauPickerScreen} />
      <Stack.Screen name="Disclaimer" component={DisclaimerScreen} />
      <Stack.Screen name="BlePermission" component={BlePermissionScreen} />
    </Stack.Navigator>
  );
}
