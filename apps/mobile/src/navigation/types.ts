import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  NiveauPicker: { email: string; password: string };
  Disclaimer: undefined;
  BlePermission: undefined;
};

export type MainTabsParamList = {
  Accueil: undefined;
  Tendances: undefined;
  Profil: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  DiveDetail: { diveId: string };
  Sync: undefined;
};

export type AuthScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<AuthStackParamList, T>;
export type MainTabProps<T extends keyof MainTabsParamList> = BottomTabScreenProps<MainTabsParamList, T>;
export type RootStackProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
