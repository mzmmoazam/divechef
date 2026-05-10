import { api } from './api';
import { setToken, clearToken } from './token';
import type { User, Niveau, Locale } from '@divechef/shared/types';

interface AuthResponse {
  token: string;
  user: User;
}

export async function signup(
  email: string,
  password: string,
  niveau: Niveau,
  locale: Locale
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/api/auth/signup', {
    email, password, niveau, locale,
  });
  await setToken(data.token);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/api/auth/login', { email, password });
  await setToken(data.token);
  return data;
}

export async function getMe(): Promise<{ user: User }> {
  const { data } = await api.get<{ user: User }>('/api/auth/me');
  return data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/api/auth/logout');
  } finally {
    await clearToken();
  }
}
