import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Niveau, Locale } from '@divechef/shared/types';
import * as authService from '../services/auth';
import { getToken, clearToken } from '../services/token';
import { onAuthRevoked } from '../services/authEvents';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, niveau: Niveau, locale: Locale) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const { user } = await authService.getMe();
          setState({ user, isLoading: false, isAuthenticated: true });
        } catch {
          await clearToken();
          setState({ user: null, isLoading: false, isAuthenticated: false });
        }
      } else {
        setState({ user: null, isLoading: false, isAuthenticated: false });
      }
    })();
  }, []);

  useEffect(() => {
    return onAuthRevoked(() => {
      setState({ user: null, isLoading: false, isAuthenticated: false });
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const { user } = await authService.login(email, password);
      setState({ user, isLoading: false, isAuthenticated: true });
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const signup = useCallback(
    async (email: string, password: string, niveau: Niveau, locale: Locale) => {
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const { user } = await authService.signup(email, password, niveau, locale);
        setState({ user, isLoading: false, isAuthenticated: true });
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }));
        throw error;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    await authService.logout();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  const refreshUser = useCallback(async () => {
    const { user } = await authService.getMe();
    setState({ user, isLoading: false, isAuthenticated: true });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
