import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import type { MainTabsParamList } from './types';
import AccueilScreen from '../screens/AccueilScreen';
import TendancesScreen from '../screens/TendancesScreen';
import ProfilScreen from '../screens/ProfilScreen';

const Tab = createBottomTabNavigator<MainTabsParamList>();

export default function MainTabs() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator screenOptions={{ headerShown: true }}>
      <Tab.Screen name="Accueil" component={AccueilScreen} options={{ title: t('home.title') }} />
      <Tab.Screen name="Tendances" component={TendancesScreen} options={{ title: t('trends.title') }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ title: t('profile.title') }} />
    </Tab.Navigator>
  );
}
