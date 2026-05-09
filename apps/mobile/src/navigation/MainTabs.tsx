import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabsParamList } from './types';
import AccueilScreen from '../screens/AccueilScreen';
import TendancesScreen from '../screens/TendancesScreen';
import ProfilScreen from '../screens/ProfilScreen';

const Tab = createBottomTabNavigator<MainTabsParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: true }}>
      <Tab.Screen name="Accueil" component={AccueilScreen} options={{ title: 'Accueil' }} />
      <Tab.Screen name="Tendances" component={TendancesScreen} options={{ title: 'Tendances' }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  );
}
