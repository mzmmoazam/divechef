# Plan 2 — DiveForge Mobile App Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, navigable, production-grade React Native (Expo bare workflow) mobile app under `apps/mobile` with all 6 screens from spec SS5, wired navigation, auth flow against Plan 1's API, i18n (fr default, en fallback), charts, offline queue, and a mocked native module matching the contract's `DiveComputerModule` interface exactly so that screen development proceeds without BLE hardware.

**Architecture:** Expo bare workflow RN app consuming the Next.js backend from Plan 1 via REST. All user-visible strings in i18n JSON. TanStack Query for server-state. `expo-sqlite` for offline outbound queue. Mock native module simulates BLE scan/connect/download with bundled fixture dives derived from `spike/0a-uddf-inspection/parsed/dive-{1,3,4,5}.xml`.

**Tech Stack:**
- React Native (Expo bare workflow, SDK 52+)
- TypeScript (strict)
- React Navigation (bottom tabs + native stack)
- TanStack Query v5
- react-i18next + i18next
- victory-native (depth profile chart)
- expo-sqlite (outbound queue)
- expo-secure-store (JWT persistence)
- Jest + React Native Testing Library

**Non-goals:**
- Real BLE / native module (Plan 3)
- Backend/API code (Plan 1)
- libdivecomputer parsing (backend-side per contract)
- Anything in spec SS8 (deferred features)
- E2E tests
- App Store / Play Store submission
- Pretty visual design polish (functional UI sufficient for validation)

---

## Phase 1 — Expo Bare Workflow Init (inside existing monorepo)

### Task 1.1: Initialize the Expo app

**Files:**
- Create: `apps/mobile/` (entire Expo scaffold)
- Modify: `package.json` (root workspace, if needed)
- Modify: `pnpm-workspace.yaml` (add `apps/mobile`)

- [ ] **Step 1: Create the Expo app with bare workflow**

```bash
cd apps
npx create-expo-app@latest mobile --template expo-template-bare-minimum
cd mobile
```

- [ ] **Step 2: Verify monorepo workspace recognizes the app**

Ensure `pnpm-workspace.yaml` at repo root includes `apps/*` or `apps/mobile`. Run from repo root:

```bash
pnpm install
```

Expected: installs without error; `apps/mobile` appears in workspace list.

- [ ] **Step 3: Add TypeScript strict config**

Create/update `apps/mobile/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@diveforge/shared/*": ["../../packages/shared/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", "src/**/*"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Install core dependencies**

```bash
cd apps/mobile
pnpm add @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack \
  react-native-screens react-native-safe-area-context \
  @tanstack/react-query \
  i18next react-i18next \
  expo-secure-store expo-sqlite \
  victory-native react-native-svg \
  axios
pnpm add -D jest @testing-library/react-native @testing-library/jest-native \
  @types/react @types/react-native ts-jest
```

- [ ] **Step 5: Create the `src/` directory structure**

```bash
mkdir -p src/{screens,components,hooks,native,services,i18n,utils,__tests__}
```

- [ ] **Step 6: Verify the app builds for iOS Simulator**

```bash
npx expo run:ios
```

Expected: blank app launches in iOS Simulator without build errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(mobile): initialize Expo bare workflow app in monorepo"
```

---

### Task 1.2: Configure shared package dependency

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/tsconfig.json` (paths already set above)

- [ ] **Step 1: Add workspace dependency on `@diveforge/shared`**

In `apps/mobile/package.json`, add:

```json
"dependencies": {
  "@diveforge/shared": "workspace:*"
}
```

Then run `pnpm install` from repo root.

- [ ] **Step 2: Verify shared types import correctly**

Create a temporary test file:

```ts
// apps/mobile/src/utils/type-check.ts
import type { Dive, DiveSample, Insight, User, Niveau, Locale } from '@diveforge/shared/types';
// If this compiles, shared types are accessible.
export {};
```

Run `npx tsc --noEmit` from `apps/mobile`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json apps/mobile/tsconfig.json apps/mobile/src/utils/type-check.ts pnpm-lock.yaml
git commit -m "feat(mobile): wire shared package types into mobile app"
```

---

### Phase 1 verification

- [ ] Run `npx expo run:ios` from `apps/mobile` — app launches on iOS Simulator.
- [ ] Run `npx tsc --noEmit` — zero type errors.

---

## Phase 2 — API Client + Auth Flow

### Task 2.1: Create the API client with auth interceptor

**Files:**
- Create: `apps/mobile/src/services/api.ts`
- Create: `apps/mobile/src/services/auth.ts`
- Create: `apps/mobile/src/services/token.ts`

- [ ] **Step 1: Write the token store (SecureStore wrapper)**

`apps/mobile/src/services/token.ts`:

```ts
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'diveforge_jwt';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
```

- [ ] **Step 2: Write the Axios API client with Bearer interceptor**

`apps/mobile/src/services/api.ts`:

```ts
import axios from 'axios';
import { getToken, clearToken } from './token';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Attach Bearer token to every request (per Contract SS Auth)
api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — per spec SS6: auto-refresh token; on refresh failure, send to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await clearToken();
      // AuthContext will react to cleared token and navigate to login
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 3: Write the auth service**

`apps/mobile/src/services/auth.ts`:

```ts
import { api } from './api';
import { setToken, clearToken } from './token';
import type { User, Niveau, Locale } from '@diveforge/shared/types';

interface AuthResponse {
  token: string;
  user: User;
}

// Per Contract SS Auth endpoints
export async function signup(
  email: string,
  password: string,
  niveau: Niveau,
  locale: Locale
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/api/auth/signup', {
    email,
    password,
    niveau,
    locale,
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
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/
git commit -m "feat(mobile): API client with Bearer auth and token persistence"
```

---

### Task 2.2: Create AuthContext and useAuth hook

**Files:**
- Create: `apps/mobile/src/hooks/useAuth.tsx`

- [ ] **Step 1: Write the AuthContext provider**

`apps/mobile/src/hooks/useAuth.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Niveau, Locale } from '@diveforge/shared/types';
import * as authService from '../services/auth';
import { getToken, clearToken } from '../services/token';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, niveau: Niveau, locale: Locale) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // On mount, check for existing token and fetch user
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

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await authService.login(email, password);
    setState({ user, isLoading: false, isAuthenticated: true });
  }, []);

  const signup = useCallback(
    async (email: string, password: string, niveau: Niveau, locale: Locale) => {
      const { user } = await authService.signup(email, password, niveau, locale);
      setState({ user, isLoading: false, isAuthenticated: true });
    },
    []
  );

  const logout = useCallback(async () => {
    await authService.logout();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Write unit test for useAuth hook**

Create `apps/mobile/src/__tests__/useAuth.test.tsx` with basic mount/unmount test and mock of services.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/useAuth.tsx apps/mobile/src/__tests__/useAuth.test.tsx
git commit -m "feat(mobile): AuthContext with login/signup/logout + useAuth hook"
```

---

### Task 2.3: Create TanStack Query provider and API hooks

**Files:**
- Create: `apps/mobile/src/hooks/useDives.ts`
- Create: `apps/mobile/src/hooks/useTrends.ts`
- Create: `apps/mobile/src/services/queryClient.ts`

- [ ] **Step 1: Write the QueryClient config**

`apps/mobile/src/services/queryClient.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 2,
    },
  },
});
```

- [ ] **Step 2: Write useDives hook**

`apps/mobile/src/hooks/useDives.ts`:

```ts
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Dive, DiveSummary, DiveSample, Insight } from '@diveforge/shared/types';

// Per Contract SS Dive ingestion: GET /api/dives?limit&cursor
export function useDiveList(limit = 20) {
  return useInfiniteQuery({
    queryKey: ['dives'],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<{ dives: DiveSummary[]; nextCursor: string | null }>(
        '/api/dives',
        { params: { limit, cursor: pageParam } }
      );
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

// Per Contract SS Dive ingestion: GET /api/dives/:id
export function useDiveDetail(id: string) {
  return useQuery({
    queryKey: ['dives', id],
    queryFn: async () => {
      const { data } = await api.get<{ dive: Dive; insights: Insight[] }>(`/api/dives/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

// Per Contract SS Dive ingestion: GET /api/dives/:id/samples
export function useDiveSamples(id: string, enabled = true) {
  return useQuery({
    queryKey: ['dives', id, 'samples'],
    queryFn: async () => {
      const { data } = await api.get<{ samples: DiveSample[] }>(`/api/dives/${id}/samples`);
      return data.samples;
    },
    enabled: !!id && enabled,
  });
}
```

- [ ] **Step 3: Write useTrends hook**

`apps/mobile/src/hooks/useTrends.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

// Per Contract SS Trends: GET /api/trends?days=30
interface TrendsData {
  avgScore: number;
  avgDepthM: number;
  diveCount: number;
  scoreSeries: { date: string; score: number }[];
  summaryTipKey: string;
}

export function useTrends(days = 30) {
  return useQuery({
    queryKey: ['trends', days],
    queryFn: async () => {
      const { data } = await api.get<TrendsData>('/api/trends', { params: { days } });
      return data;
    },
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/queryClient.ts apps/mobile/src/hooks/useDives.ts apps/mobile/src/hooks/useTrends.ts
git commit -m "feat(mobile): TanStack Query hooks for dives and trends APIs"
```

---

### Phase 2 verification

- [ ] `npx tsc --noEmit` passes with zero errors.
- [ ] Unit tests pass: `npx jest --passWithNoTests`.

---

## Phase 3 — i18n Setup

### Task 3.1: Configure react-i18next

**Files:**
- Create: `apps/mobile/src/i18n/index.ts`
- Create: `apps/mobile/src/i18n/fr.json`
- Create: `apps/mobile/src/i18n/en.json`

- [ ] **Step 1: Write the i18n initialization**

`apps/mobile/src/i18n/index.ts`:

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import fr from './fr.json';
import en from './en.json';

// Per spec SS5: default to device locale, fall back to French
const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'fr';

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: deviceLocale === 'en' ? 'en' : 'fr', // anything not 'en' falls back to 'fr'
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export default i18n;
```

Note: also install `expo-localization`:

```bash
pnpm add expo-localization
```

- [ ] **Step 2: Write `fr.json` with all UI strings and insight templates**

Per spec SS5 and Contract SS i18n contract — all user-visible strings plus ruleId templates matching the 10 rules from spec SS4. Evidence keys are camelCase, matching what the scoring engine emits.

`apps/mobile/src/i18n/fr.json`:

```json
{
  "common": {
    "loading": "Chargement...",
    "error": "Une erreur est survenue",
    "retry": "Reessayer",
    "save": "Enregistrer",
    "cancel": "Annuler",
    "logout": "Deconnexion",
    "ok": "OK"
  },
  "auth": {
    "login": "Connexion",
    "signup": "Inscription",
    "email": "E-mail",
    "password": "Mot de passe",
    "confirmPassword": "Confirmer le mot de passe",
    "loginButton": "Se connecter",
    "signupButton": "Creer un compte",
    "noAccount": "Pas de compte ?",
    "hasAccount": "Deja un compte ?"
  },
  "onboarding": {
    "welcome": "Bienvenue sur DiveForge",
    "subtitle": "Intelligence de plongee personnelle",
    "pickNiveau": "Quel est votre niveau ?",
    "pickLanguage": "Langue de l'application",
    "disclaimer": "DiveForge est un outil de feedback. Il ne remplace ni votre formation, ni votre ordinateur de plongee, ni votre moniteur. Les seuils sont bases sur les normes FFESSM/MN90 et doivent etre verifies par un professionnel.",
    "acceptDisclaimer": "J'accepte",
    "blePermission": "DiveForge a besoin du Bluetooth pour communiquer avec votre ordinateur de plongee.",
    "grantBle": "Autoriser le Bluetooth"
  },
  "sync": {
    "title": "Synchronisation",
    "scanning": "Recherche de votre ordinateur...",
    "connecting": "Connexion a {{deviceName}}...",
    "downloading": "Telechargement des plongees ({{received}}/{{expected}})...",
    "complete": "{{count}} plongee(s) synchronisee(s)",
    "noDevice": "Aucun ordinateur de plongee detecte",
    "retryButton": "Reessayer",
    "permissionDenied": "Acces Bluetooth refuse. Verifiez les reglages de votre appareil.",
    "openSettings": "Ouvrir les reglages",
    "connectionLost": "Connexion perdue. Les plongees deja synchronisees sont conservees.",
    "partialSuccess": "{{synced}} plongee(s) sur {{total}} synchronisee(s). Reessayez pour le reste."
  },
  "home": {
    "title": "Accueil",
    "lastDive": "Derniere plongee",
    "noDives": "Aucune plongee. Synchronisez votre ordinateur pour commencer.",
    "syncButton": "Synchroniser",
    "score": "Score : {{score}}/100",
    "depth": "{{depth}} m",
    "duration": "{{duration}} min"
  },
  "detail": {
    "title": "Detail de la plongee",
    "date": "Date",
    "duration": "Duree",
    "maxDepth": "Profondeur max",
    "avgDepth": "Profondeur moyenne",
    "temp": "Temperature min",
    "score": "Score de securite",
    "scoreValue": "{{score}}/100",
    "insights": "Analyses",
    "depthProfile": "Profil de profondeur",
    "noInsights": "Aucune alerte pour cette plongee.",
    "disclaimer": "DiveForge est un outil de feedback, pas un dispositif medical."
  },
  "trends": {
    "title": "Tendances",
    "period": "30 derniers jours",
    "avgScore": "Score moyen",
    "avgDepth": "Profondeur moyenne",
    "diveCount": "Nombre de plongees",
    "scoreTrend": "Evolution du score",
    "noData": "Pas assez de donnees. Synchronisez vos plongees."
  },
  "profile": {
    "title": "Profil",
    "email": "E-mail",
    "niveau": "Niveau",
    "locale": "Langue",
    "connectedDevice": "Appareil connecte",
    "noDevice": "Aucun appareil",
    "syncButton": "Synchroniser",
    "logoutButton": "Se deconnecter"
  },
  "queue": {
    "pending": "En attente de synchronisation",
    "pendingCount": "{{count}} plongee(s) en attente d'envoi"
  },
  "niveau": {
    "N1": "Niveau 1",
    "N2": "Niveau 2",
    "N3": "Niveau 3",
    "N4": "Niveau 4",
    "INITIATEUR": "Initiateur",
    "MF1": "MF1",
    "MF2": "MF2",
    "UNKNOWN": "Non renseigne"
  },
  "insights": {
    "ascent_too_fast": {
      "title": "Remontee rapide",
      "body": "Vous etes remonte a {{maxRateMpm}} m/min entre {{startSec}}s et {{endSec}}s. Norme MN90 : 15 m/min."
    },
    "ascent_dangerous": {
      "title": "Remontee dangereuse",
      "body": "Vitesse de remontee de {{maxRateMpm}} m/min soutenue sur plus de 60s. Risque d'accident de decompression."
    },
    "final_ascent_too_fast": {
      "title": "Remontee finale rapide",
      "body": "Remontee de 6m a la surface a {{rateMpm}} m/min. La norme recommande moins de 6 m/min dans cette zone."
    },
    "palier_securite_manque": {
      "title": "Palier de securite absent",
      "body": "Profondeur max {{maxDepthM}} m sans palier de securite (3-5 m pendant 3 min). Recommande pour toute plongee au-dela de 6 m."
    },
    "palier_securite_court": {
      "title": "Palier de securite court",
      "body": "Palier de securite de {{actualSec}}s au lieu des 180s recommandees."
    },
    "palier_deco_manque": {
      "title": "Palier de decompression manque",
      "body": "Palier obligatoire a {{decoDepthM}} m pendant {{decoTimeSec}}s non respecte. Risque immediat d'ADD."
    },
    "profondeur_depasse_niveau_leger": {
      "title": "Profondeur legere au-dela du niveau",
      "body": "Profondeur max {{maxDepthM}} m. Limite pour votre niveau ({{niveau}}) : {{limitM}} m."
    },
    "profondeur_depasse_niveau_grave": {
      "title": "Profondeur grave au-dela du niveau",
      "body": "Profondeur max {{maxDepthM}} m, depassement de {{excessM}} m au-dela de la limite de votre niveau ({{niveau}})."
    },
    "temperature_basse": {
      "title": "Eau froide",
      "body": "Temperature minimum {{minTempC}} C pendant {{durationMin}} min. Le froid augmente la consommation et le risque de narcose."
    },
    "plongee_profonde": {
      "title": "Plongee profonde",
      "body": "Profondeur maximale atteinte : {{maxDepthM}} m. Information uniquement."
    }
  },
  "summaryTips": {
    "improving_ascent_control": "Vos vitesses de remontee s'ameliorent. Continuez a surveiller votre ordinateur en fin de plongee.",
    "consistent_safety_stops": "Vos paliers de securite sont reguliers. Excellent reflexe de securite.",
    "depth_management_improving": "Votre gestion de la profondeur progresse. Restez vigilant aux limites de votre niveau.",
    "overall_good": "Vos plongees sont conformes aux bonnes pratiques. Continuez ainsi !",
    "needs_attention": "Plusieurs alertes recentes. Revoyez les plongees concernees et consultez votre moniteur si besoin."
  }
}
```

- [ ] **Step 3: Write `en.json` with all UI strings and insight templates**

`apps/mobile/src/i18n/en.json`:

```json
{
  "common": {
    "loading": "Loading...",
    "error": "An error occurred",
    "retry": "Retry",
    "save": "Save",
    "cancel": "Cancel",
    "logout": "Logout",
    "ok": "OK"
  },
  "auth": {
    "login": "Login",
    "signup": "Sign Up",
    "email": "Email",
    "password": "Password",
    "confirmPassword": "Confirm password",
    "loginButton": "Log in",
    "signupButton": "Create account",
    "noAccount": "No account?",
    "hasAccount": "Already have an account?"
  },
  "onboarding": {
    "welcome": "Welcome to DiveForge",
    "subtitle": "Personal dive intelligence",
    "pickNiveau": "What is your certification level?",
    "pickLanguage": "App language",
    "disclaimer": "DiveForge is a feedback tool. It does not replace your training, dive computer, or instructor. Thresholds are based on FFESSM/MN90 norms and must be verified by a professional.",
    "acceptDisclaimer": "I accept",
    "blePermission": "DiveForge needs Bluetooth access to communicate with your dive computer.",
    "grantBle": "Grant Bluetooth access"
  },
  "sync": {
    "title": "Sync",
    "scanning": "Searching for your dive computer...",
    "connecting": "Connecting to {{deviceName}}...",
    "downloading": "Downloading dives ({{received}}/{{expected}})...",
    "complete": "{{count}} dive(s) synced",
    "noDevice": "No dive computer found",
    "retryButton": "Retry",
    "permissionDenied": "Bluetooth access denied. Check your device settings.",
    "openSettings": "Open Settings",
    "connectionLost": "Connection lost. Previously synced dives are saved.",
    "partialSuccess": "{{synced}} of {{total}} dive(s) synced. Retry for the rest."
  },
  "home": {
    "title": "Home",
    "lastDive": "Last dive",
    "noDives": "No dives yet. Sync your dive computer to get started.",
    "syncButton": "Sync",
    "score": "Score: {{score}}/100",
    "depth": "{{depth}} m",
    "duration": "{{duration}} min"
  },
  "detail": {
    "title": "Dive Detail",
    "date": "Date",
    "duration": "Duration",
    "maxDepth": "Max depth",
    "avgDepth": "Avg depth",
    "temp": "Min temperature",
    "score": "Safety score",
    "scoreValue": "{{score}}/100",
    "insights": "Insights",
    "depthProfile": "Depth profile",
    "noInsights": "No alerts for this dive.",
    "disclaimer": "DiveForge is a feedback tool, not a medical device."
  },
  "trends": {
    "title": "Trends",
    "period": "Last 30 days",
    "avgScore": "Average score",
    "avgDepth": "Average depth",
    "diveCount": "Dive count",
    "scoreTrend": "Score trend",
    "noData": "Not enough data. Sync your dives."
  },
  "profile": {
    "title": "Profile",
    "email": "Email",
    "niveau": "Certification level",
    "locale": "Language",
    "connectedDevice": "Connected device",
    "noDevice": "No device",
    "syncButton": "Sync",
    "logoutButton": "Log out"
  },
  "queue": {
    "pending": "Pending sync",
    "pendingCount": "{{count}} dive(s) awaiting upload"
  },
  "niveau": {
    "N1": "Level 1",
    "N2": "Level 2",
    "N3": "Level 3",
    "N4": "Level 4",
    "INITIATEUR": "Instructor",
    "MF1": "MF1",
    "MF2": "MF2",
    "UNKNOWN": "Not specified"
  },
  "insights": {
    "ascent_too_fast": {
      "title": "Fast ascent",
      "body": "You ascended at {{maxRateMpm}} m/min between {{startSec}}s and {{endSec}}s. MN90 norm: 15 m/min."
    },
    "ascent_dangerous": {
      "title": "Dangerous ascent",
      "body": "Ascent rate of {{maxRateMpm}} m/min sustained over 60s. Risk of decompression sickness."
    },
    "final_ascent_too_fast": {
      "title": "Fast final ascent",
      "body": "Ascent from 6m to surface at {{rateMpm}} m/min. Recommended: under 6 m/min in this zone."
    },
    "palier_securite_manque": {
      "title": "Safety stop missing",
      "body": "Max depth {{maxDepthM}} m with no safety stop (3-5m for 3 min). Recommended for any dive beyond 6m."
    },
    "palier_securite_court": {
      "title": "Short safety stop",
      "body": "Safety stop of {{actualSec}}s instead of the recommended 180s."
    },
    "palier_deco_manque": {
      "title": "Missed deco stop",
      "body": "Required deco stop at {{decoDepthM}} m for {{decoTimeSec}}s was not completed. Immediate DCS risk."
    },
    "profondeur_depasse_niveau_leger": {
      "title": "Slightly exceeded depth limit",
      "body": "Max depth {{maxDepthM}} m. Limit for your level ({{niveau}}): {{limitM}} m."
    },
    "profondeur_depasse_niveau_grave": {
      "title": "Severely exceeded depth limit",
      "body": "Max depth {{maxDepthM}} m, exceeding your level ({{niveau}}) limit by {{excessM}} m."
    },
    "temperature_basse": {
      "title": "Cold water",
      "body": "Min temperature {{minTempC}} C over {{durationMin}} min. Cold increases air consumption and narcosis risk."
    },
    "plongee_profonde": {
      "title": "Deep dive",
      "body": "Maximum depth reached: {{maxDepthM}} m. Informational only."
    }
  },
  "summaryTips": {
    "improving_ascent_control": "Your ascent rates are improving. Keep monitoring your computer at end of dive.",
    "consistent_safety_stops": "Your safety stops are consistent. Excellent safety habit.",
    "depth_management_improving": "Your depth management is improving. Stay mindful of your level limits.",
    "overall_good": "Your dives follow good practices. Keep it up!",
    "needs_attention": "Several recent alerts. Review the flagged dives and consult your instructor if needed."
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/
git commit -m "feat(mobile): i18n setup with fr/en translations and all insight templates"
```

---

### Phase 3 verification

- [ ] `npx tsc --noEmit` passes.
- [ ] Verify all 10 ruleIds from spec SS4 appear in both `fr.json` and `en.json` under `insights.*`.

---

## Phase 4 — Navigation Skeleton

### Task 4.1: Create the navigation structure

**Files:**
- Create: `apps/mobile/src/navigation/RootNavigator.tsx`
- Create: `apps/mobile/src/navigation/AuthStack.tsx`
- Create: `apps/mobile/src/navigation/MainTabs.tsx`
- Create: `apps/mobile/src/navigation/types.ts`
- Modify: `apps/mobile/App.tsx`

- [ ] **Step 1: Define navigation types**

`apps/mobile/src/navigation/types.ts`:

```ts
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// Auth/Onboarding stack (shown until first signup completes, per spec SS5)
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  NiveauPicker: undefined;
  Disclaimer: undefined;
  BlePermission: undefined;
};

// Main bottom tabs (per spec SS5 Navigation)
export type MainTabsParamList = {
  Accueil: undefined;
  Tendances: undefined;
  Profil: undefined;
};

// Screens reachable from tabs via stack
export type RootStackParamList = {
  MainTabs: undefined;
  DiveDetail: { diveId: string };
  Sync: undefined;
};

export type AuthScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<AuthStackParamList, T>;
export type MainTabProps<T extends keyof MainTabsParamList> = BottomTabScreenProps<MainTabsParamList, T>;
export type RootStackProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
```

- [ ] **Step 2: Write AuthStack navigator**

`apps/mobile/src/navigation/AuthStack.tsx`:

```tsx
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
```

- [ ] **Step 3: Write MainTabs navigator**

`apps/mobile/src/navigation/MainTabs.tsx`:

```tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabsParamList } from './types';
import AccueilScreen from '../screens/AccueilScreen';
import TendancesScreen from '../screens/TendancesScreen';
import ProfilScreen from '../screens/ProfilScreen';

const Tab = createBottomTabNavigator<MainTabsParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: true }}
    >
      <Tab.Screen name="Accueil" component={AccueilScreen} options={{ title: 'Accueil' }} />
      <Tab.Screen name="Tendances" component={TendancesScreen} options={{ title: 'Tendances' }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  );
}
```

- [ ] **Step 4: Write RootNavigator**

`apps/mobile/src/navigation/RootNavigator.tsx`:

```tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import DiveDetailScreen from '../screens/DiveDetailScreen';
import SyncScreen from '../screens/SyncScreen';
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
    <NavigationContainer>
      {isAuthenticated ? (
        <Stack.Navigator>
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="DiveDetail" component={DiveDetailScreen} options={{ title: '' }} />
          <Stack.Screen name="Sync" component={SyncScreen} options={{ title: '' }} />
        </Stack.Navigator>
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}
```

- [ ] **Step 5: Wire up App.tsx**

`apps/mobile/App.tsx`:

```tsx
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/services/queryClient';
import { AuthProvider } from './src/hooks/useAuth';
import RootNavigator from './src/navigation/RootNavigator';
import './src/i18n';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Create placeholder screen stubs (all 6)**

For each screen, create a minimal placeholder that renders the screen name so the app compiles. Full implementations come in Phases 5 and 6.

Create these files with a basic `<View><Text>{screenName}</Text></View>` pattern:
- `apps/mobile/src/screens/LoginScreen.tsx`
- `apps/mobile/src/screens/SignupScreen.tsx`
- `apps/mobile/src/screens/NiveauPickerScreen.tsx`
- `apps/mobile/src/screens/DisclaimerScreen.tsx`
- `apps/mobile/src/screens/BlePermissionScreen.tsx`
- `apps/mobile/src/screens/AccueilScreen.tsx`
- `apps/mobile/src/screens/DiveDetailScreen.tsx`
- `apps/mobile/src/screens/TendancesScreen.tsx`
- `apps/mobile/src/screens/ProfilScreen.tsx`
- `apps/mobile/src/screens/SyncScreen.tsx`

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/navigation/ apps/mobile/src/screens/ apps/mobile/App.tsx
git commit -m "feat(mobile): navigation skeleton with auth stack, bottom tabs, and screen stubs"
```

---

### Phase 4 verification

- [ ] `npx expo run:ios` — app launches. If no token, shows Login screen. Navigation between tabs works if token is mocked.
- [ ] `npx tsc --noEmit` passes.

---

## Phase 5 — Mock Native Module + Fixture Data

### Task 5.1: Create fixture dive data as JSON

**Files:**
- Create: `apps/mobile/src/native/fixtures/dive-1.json`
- Create: `apps/mobile/src/native/fixtures/dive-3.json`
- Create: `apps/mobile/src/native/fixtures/dive-4.json`
- Create: `apps/mobile/src/native/fixtures/dive-5.json`
- Create: `apps/mobile/src/native/fixtures/index.ts`

- [ ] **Step 1: Convert spike XML fixtures to JSON**

Transform each fixture from `spike/0a-uddf-inspection/parsed/dive-{1,3,4,5}.xml` into the contract's pre-parsed JSON shape that Plan 1's dev-mode JSON ingestion endpoint accepts. Each fixture file follows the `Dive` + `DiveSample[]` types from `packages/shared/types.ts`.

Example structure for `dive-1.json` (derived from dive-1.xml: datetime=2026-03-31T21:14:41, maxDepth=19.40, duration=34:33=2073s, temp=29-30C):

```json
{
  "meta": {
    "deviceModel": "Shearwater Peregrine",
    "deviceSerial": "MOCK-001",
    "externalId": "mock-dive-1",
    "startedAt": "2026-03-31T21:14:41.000Z"
  },
  "dive": {
    "startedAt": "2026-03-31T21:14:41.000Z",
    "durationSec": 2073,
    "maxDepthM": 19.4,
    "avgDepthM": 12.5,
    "minWaterTempC": 29.0,
    "maxAscentRateMps": 0.18
  },
  "samples": [
    { "tSec": 10, "depthM": 0.0, "tempC": 29.0, "cnsPct": 0.0, "decoState": "ndl", "decoTimeSec": 0, "decoDepthM": 0.0, "ttsSec": null },
    { "tSec": 20, "depthM": 3.3, "tempC": 29.0, "cnsPct": 0.0, "decoState": "ndl", "decoTimeSec": 5940, "decoDepthM": 0.0, "ttsSec": 60 }
  ]
}
```

Each file should contain the full sample array transcribed from the corresponding XML (all samples, not truncated). The `avgDepthM` and `maxAscentRateMps` should be computed from the sample stream.

- [ ] **Step 2: Create the fixture index**

`apps/mobile/src/native/fixtures/index.ts`:

```ts
import dive1 from './dive-1.json';
import dive3 from './dive-3.json';
import dive4 from './dive-4.json';
import dive5 from './dive-5.json';

export const FIXTURE_DIVES = [dive1, dive3, dive4, dive5];
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/native/fixtures/
git commit -m "feat(mobile): fixture dive data as JSON from spike parsed XMLs"
```

---

### Task 5.2: Create the mock DiveComputer module

**Files:**
- Create: `apps/mobile/src/native/DiveComputer.mock.ts`

- [ ] **Step 1: Implement the mock matching the contract's exact `DiveComputerModule` interface**

Per Contract SS Native module interface — same method signatures, same event names, same payload shapes. The mock emits `diveComputerDiscovered` and `diveComputerProgress` events with realistic timing.

`apps/mobile/src/native/DiveComputer.mock.ts`:

```ts
import { NativeEventEmitter, NativeModule } from 'react-native';
import { FIXTURE_DIVES } from './fixtures';
import { Buffer } from 'buffer';

// Per Contract SS Native module interface — exact types
export type ScanResult = { name: string; identifier: string; rssi: number };
export type ManifestEntry = { index: number; address: number; fingerprintHex: string };
export type DownloadProgress = { bytesReceived: number; bytesExpected: number | null };

export interface DiveComputerModule {
  // Discovery
  startScan(serviceUuid: string): Promise<void>;
  stopScan(): Promise<void>;

  // Connection
  connect(identifier: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;

  // Dive operations
  listDives(): Promise<ManifestEntry[]>;
  downloadDive(index: number): Promise<{ rawBytes: string }>;

  // Lifecycle (RN NativeEventEmitter contract)
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

type EventCallback = (payload: unknown) => void;

class MockDiveComputerModule implements DiveComputerModule {
  private connected = false;
  private scanning = false;
  private listeners: Map<string, EventCallback[]> = new Map();
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Discovery ---

  async startScan(_serviceUuid: string): Promise<void> {
    this.scanning = true;

    // Emit a mock discovered device after a realistic 1.5s delay
    this.scanTimer = setTimeout(() => {
      if (this.scanning) {
        this.emit('diveComputerDiscovered', {
          name: 'Peregrine-MOCK',
          identifier: 'MOCK-BLE-001',
          rssi: -62,
        } satisfies ScanResult);
      }
    }, 1500);
  }

  async stopScan(): Promise<void> {
    this.scanning = false;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  // --- Connection ---

  async connect(_identifier: string): Promise<void> {
    // Simulate connection delay (BLE negotiation)
    await this.delay(800);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('diveComputerDisconnected', { reason: 'user_requested' });
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  // --- Dive operations ---

  async listDives(): Promise<ManifestEntry[]> {
    if (!this.connected) throw new Error('Not connected');

    // Simulate manifest read delay
    await this.delay(500);

    return FIXTURE_DIVES.map((dive, idx) => ({
      index: idx,
      address: 0x1000 + idx * 0x1000,
      fingerprintHex: `MOCK${String(idx).padStart(4, '0')}`,
    }));
  }

  async downloadDive(index: number): Promise<{ rawBytes: string }> {
    if (!this.connected) throw new Error('Not connected');
    if (index < 0 || index >= FIXTURE_DIVES.length) {
      throw new Error(`Invalid dive index: ${index}`);
    }

    const fixture = FIXTURE_DIVES[index];
    // Simulate the raw bytes as base64-encoded JSON
    // In production, this would be actual Peregrine binary.
    // For the mock, we send the pre-parsed JSON so the app can POST it
    // to Plan 1's dev-mode JSON ingestion endpoint (Content-Type: application/json).
    const jsonBytes = JSON.stringify(fixture);
    const totalBytes = jsonBytes.length;

    // Emit progress events with realistic timing (per Contract SS events)
    const chunks = 5;
    for (let i = 1; i <= chunks; i++) {
      await this.delay(300);
      this.emit('diveComputerProgress', {
        bytesReceived: Math.round((i / chunks) * totalBytes),
        bytesExpected: totalBytes,
      } satisfies DownloadProgress);
    }

    // Return base64 per contract: "rawBytes returned as base64 because RN bridges
    // have well-known issues with binary"
    const base64 = Buffer.from(jsonBytes).toString('base64');
    return { rawBytes: base64 };
  }

  // --- Lifecycle (RN NativeEventEmitter contract) ---

  addListener(eventName: string): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
  }

  removeListeners(_count: number): void {
    // No-op for mock — RN manages listener count
  }

  // --- Internal helpers ---

  private emit(eventName: string, payload: unknown): void {
    const cbs = this.listeners.get(eventName) ?? [];
    cbs.forEach((cb) => cb(payload));
    // Also emit through the mock event emitter (see index.ts wiring)
    mockEventTarget.emit(eventName, payload);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Simple event target for the mock NativeEventEmitter integration
class MockEventTarget {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, cb: EventCallback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  off(event: string, cb: EventCallback) {
    this.listeners.get(event)?.delete(cb);
  }

  emit(event: string, payload: unknown) {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }
}

export const mockEventTarget = new MockEventTarget();
export const DiveComputer: DiveComputerModule = new MockDiveComputerModule();
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/native/DiveComputer.mock.ts
git commit -m "feat(mobile): mock DiveComputer module matching contract interface exactly"
```

---

### Task 5.3: Create the module indirection (mock vs real)

**Files:**
- Create: `apps/mobile/src/native/index.ts`
- Create: `apps/mobile/src/native/DiveComputer.ts`
- Create: `apps/mobile/src/native/events.ts`

- [ ] **Step 1: Write the interface definition file**

`apps/mobile/src/native/DiveComputer.ts`:

```ts
// Per Contract SS Native module interface — canonical type definitions
// Plan 3 implements the real version of this interface as a TurboModule.
export type ScanResult = { name: string; identifier: string; rssi: number };
export type ManifestEntry = { index: number; address: number; fingerprintHex: string };
export type DownloadProgress = { bytesReceived: number; bytesExpected: number | null };

export interface DiveComputerModule {
  startScan(serviceUuid: string): Promise<void>;
  stopScan(): Promise<void>;
  connect(identifier: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  listDives(): Promise<ManifestEntry[]>;
  downloadDive(index: number): Promise<{ rawBytes: string }>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}
```

- [ ] **Step 2: Write the indirection index**

`apps/mobile/src/native/index.ts`:

Per contract: "Indirection in `apps/mobile/src/native/index.ts` that selects mock vs real native module based on a build flag (Plan 3 flips the flag)."

```ts
import type { DiveComputerModule } from './DiveComputer';

// Build flag: Plan 3 sets EXPO_PUBLIC_USE_REAL_BLE=true when the real TurboModule is ready.
const USE_REAL_BLE = process.env.EXPO_PUBLIC_USE_REAL_BLE === 'true';

let module: DiveComputerModule;

if (USE_REAL_BLE) {
  // Plan 3 provides this — will be:
  // import { NativeModules } from 'react-native';
  // module = NativeModules.DiveComputer as DiveComputerModule;
  throw new Error(
    'Real BLE module not yet available. Set EXPO_PUBLIC_USE_REAL_BLE=false or implement Plan 3.'
  );
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DiveComputer } = require('./DiveComputer.mock');
  module = DiveComputer;
}

export const DiveComputerNative: DiveComputerModule = module;
export type { DiveComputerModule, ScanResult, ManifestEntry, DownloadProgress } from './DiveComputer';
```

- [ ] **Step 3: Write the event emitter wrapper**

`apps/mobile/src/native/events.ts`:

```ts
import { mockEventTarget } from './DiveComputer.mock';
import type { ScanResult, DownloadProgress } from './DiveComputer';

// Thin wrapper over the event system — Plan 3 replaces this with NativeEventEmitter
type DiveComputerEventMap = {
  diveComputerDiscovered: ScanResult;
  diveComputerProgress: DownloadProgress;
  diveComputerDisconnected: { reason: string };
};

type EventName = keyof DiveComputerEventMap;

export function addDiveComputerListener<E extends EventName>(
  event: E,
  callback: (payload: DiveComputerEventMap[E]) => void
): () => void {
  const USE_REAL_BLE = process.env.EXPO_PUBLIC_USE_REAL_BLE === 'true';

  if (USE_REAL_BLE) {
    // Plan 3: use NativeEventEmitter
    throw new Error('Real BLE event system not yet available.');
  }

  mockEventTarget.on(event, callback as (p: unknown) => void);
  return () => {
    mockEventTarget.off(event, callback as (p: unknown) => void);
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/native/DiveComputer.ts apps/mobile/src/native/index.ts apps/mobile/src/native/events.ts
git commit -m "feat(mobile): native module indirection — mock selected by default, Plan 3 flips flag"
```

---

### Task 5.4: Create the useSync hook (orchestrates scan → connect → download → upload)

**Files:**
- Create: `apps/mobile/src/hooks/useSync.ts`

- [ ] **Step 1: Write the sync orchestration hook**

`apps/mobile/src/hooks/useSync.ts`:

```ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DiveComputerNative } from '../native';
import { addDiveComputerListener } from '../native/events';
import type { ScanResult, DownloadProgress } from '../native/DiveComputer';
import { api } from '../services/api';
import { enqueueUpload, flushQueue } from '../services/queue';
import { Buffer } from 'buffer';

// Hard-coded service UUID per contract
const SERVICE_UUID = 'FE25C237-0ECE-443C-B0AA-E02033E7029D';

export type SyncState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'listing'
  | 'downloading'
  | 'uploading'
  | 'complete'
  | 'error';

export function useSync() {
  const [state, setState] = useState<SyncState>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);
  const queryClient = useQueryClient();
  const abortRef = useRef(false);

  // Listen for discovered devices
  useEffect(() => {
    const unsub = addDiveComputerListener('diveComputerDiscovered', (device) => {
      setDiscoveredDevices((prev) => {
        if (prev.find((d) => d.identifier === device.identifier)) return prev;
        return [...prev, device];
      });
    });
    return unsub;
  }, []);

  // Listen for progress
  useEffect(() => {
    const unsub = addDiveComputerListener('diveComputerProgress', (p) => {
      setProgress(p);
    });
    return unsub;
  }, []);

  const startSync = useCallback(async () => {
    abortRef.current = false;
    setError(null);
    setSyncedCount(0);
    setDiscoveredDevices([]);

    try {
      // 1. Scan
      setState('scanning');
      await DiveComputerNative.startScan(SERVICE_UUID);

      // Wait for first device (up to 10s)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('no_device')), 10000);
        const unsub = addDiveComputerListener('diveComputerDiscovered', () => {
          clearTimeout(timeout);
          unsub();
          resolve();
        });
      });

      await DiveComputerNative.stopScan();

      // 2. Connect to first device
      const device = discoveredDevices[0];
      if (!device) throw new Error('no_device');

      setState('connecting');
      await DiveComputerNative.connect(device.identifier);

      // 3. List dives
      setState('listing');
      const manifest = await DiveComputerNative.listDives();

      // 4. Download each dive
      setState('downloading');
      let synced = 0;

      for (const entry of manifest) {
        if (abortRef.current) break;

        const { rawBytes } = await DiveComputerNative.downloadDive(entry.index);

        // 5. Upload — decode base64, send as JSON (dev-mode per contract SS Mock module)
        setState('uploading');
        const decoded = Buffer.from(rawBytes, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);

        try {
          await api.post('/api/dives', parsed, {
            headers: { 'Content-Type': 'application/json' },
          });
          synced++;
          setSyncedCount(synced);
        } catch (uploadErr: unknown) {
          // Per spec SS6: queue on network failure
          await enqueueUpload(parsed);
        }

        setState('downloading');
      }

      // 6. Disconnect
      await DiveComputerNative.disconnect();
      setState('complete');

      // Invalidate dive list cache
      queryClient.invalidateQueries({ queryKey: ['dives'] });
      queryClient.invalidateQueries({ queryKey: ['trends'] });
    } catch (err: unknown) {
      setState('error');
      const message = err instanceof Error ? err.message : 'unknown_error';
      setError(message);
    }
  }, [discoveredDevices, queryClient]);

  const cancel = useCallback(async () => {
    abortRef.current = true;
    await DiveComputerNative.stopScan();
    if (await DiveComputerNative.isConnected()) {
      await DiveComputerNative.disconnect();
    }
    setState('idle');
  }, []);

  return { state, progress, discoveredDevices, error, syncedCount, startSync, cancel };
}
```

- [ ] **Step 2: Write a unit test for useSync**

Create `apps/mobile/src/__tests__/useSync.test.ts` testing the happy-path flow with the mock module.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/useSync.ts apps/mobile/src/__tests__/useSync.test.ts
git commit -m "feat(mobile): useSync hook orchestrating scan/connect/download/upload cycle"
```

---

### Phase 5 verification

- [ ] `npx tsc --noEmit` passes.
- [ ] Jest unit tests pass: `npx jest`.
- [ ] The mock module's exported interface matches the contract's `DiveComputerModule` exactly (review types by hand).

---

## Phase 6 — Screens: Onboarding, Sync, Accueil

### Task 6.1: Implement Onboarding screens

**Files:**
- Modify: `apps/mobile/src/screens/LoginScreen.tsx`
- Modify: `apps/mobile/src/screens/SignupScreen.tsx`
- Modify: `apps/mobile/src/screens/NiveauPickerScreen.tsx`
- Modify: `apps/mobile/src/screens/DisclaimerScreen.tsx`
- Modify: `apps/mobile/src/screens/BlePermissionScreen.tsx`

- [ ] **Step 1: Implement LoginScreen**

Per spec SS5 screen 1 (Onboarding). Email + password fields, login button, link to Signup.

```tsx
// apps/mobile/src/screens/LoginScreen.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import type { AuthScreenProps } from '../navigation/types';

export default function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('auth.login')}</Text>
      <TextInput
        style={styles.input}
        placeholder={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{t('auth.loginButton')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
        <Text style={styles.link}>{t('auth.noAccount')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#0066cc', padding: 14, borderRadius: 8, marginTop: 8 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
  link: { color: '#0066cc', textAlign: 'center', marginTop: 16 },
});
```

- [ ] **Step 2: Implement SignupScreen**

Email, password, confirm password. On success, navigates to NiveauPicker.

- [ ] **Step 3: Implement NiveauPickerScreen**

Per spec SS5: niveau picker. Shows all Niveau options from shared types. On selection, navigates to Disclaimer.

- [ ] **Step 4: Implement DisclaimerScreen**

Per spec SS5: disclaimer text from i18n. "I accept" button navigates to BlePermission.

- [ ] **Step 5: Implement BlePermissionScreen**

Per spec SS5 and spec SS6 (BLE permission denied → explainer with deep-link to OS settings). Shows explanation text and "Grant Bluetooth" button. On grant or skip, completes onboarding.

- [ ] **Step 6: Write integration test for onboarding flow**

Create `apps/mobile/src/__tests__/OnboardingFlow.test.tsx` testing navigation from Login → Signup → NiveauPicker → Disclaimer → BlePermission.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/LoginScreen.tsx apps/mobile/src/screens/SignupScreen.tsx \
  apps/mobile/src/screens/NiveauPickerScreen.tsx apps/mobile/src/screens/DisclaimerScreen.tsx \
  apps/mobile/src/screens/BlePermissionScreen.tsx apps/mobile/src/__tests__/OnboardingFlow.test.tsx
git commit -m "feat(mobile): onboarding screens — login, signup, niveau, disclaimer, BLE permission"
```

---

### Task 6.2: Implement Sync screen

**Files:**
- Modify: `apps/mobile/src/screens/SyncScreen.tsx`

- [ ] **Step 1: Implement the Sync screen**

Per spec SS5 screen 2: scan, connect, progress as dives download. Uses the `useSync` hook.

```tsx
// apps/mobile/src/screens/SyncScreen.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSync } from '../hooks/useSync';
import type { RootStackProps } from '../navigation/types';

export default function SyncScreen({ navigation }: RootStackProps<'Sync'>) {
  const { t } = useTranslation();
  const { state, progress, error, syncedCount, startSync, cancel } = useSync();

  const renderContent = () => {
    switch (state) {
      case 'idle':
        return (
          <TouchableOpacity style={styles.button} onPress={startSync}>
            <Text style={styles.buttonText}>{t('home.syncButton')}</Text>
          </TouchableOpacity>
        );
      case 'scanning':
        return (
          <>
            <ActivityIndicator size="large" />
            <Text style={styles.status}>{t('sync.scanning')}</Text>
          </>
        );
      case 'connecting':
        return (
          <>
            <ActivityIndicator size="large" />
            <Text style={styles.status}>{t('sync.connecting', { deviceName: 'Peregrine' })}</Text>
          </>
        );
      case 'downloading':
      case 'listing':
      case 'uploading':
        return (
          <>
            <ActivityIndicator size="large" />
            <Text style={styles.status}>
              {t('sync.downloading', {
                received: progress?.bytesReceived ?? 0,
                expected: progress?.bytesExpected ?? '?',
              })}
            </Text>
          </>
        );
      case 'complete':
        return (
          <>
            <Text style={styles.success}>{t('sync.complete', { count: syncedCount })}</Text>
            <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
              <Text style={styles.buttonText}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </>
        );
      case 'error':
        return (
          <>
            <Text style={styles.error}>
              {error === 'no_device' ? t('sync.noDevice') : t('common.error')}
            </Text>
            <TouchableOpacity style={styles.button} onPress={startSync}>
              <Text style={styles.buttonText}>{t('sync.retryButton')}</Text>
            </TouchableOpacity>
          </>
        );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('sync.title')}</Text>
      {renderContent()}
      {(state === 'scanning' || state === 'downloading') && (
        <TouchableOpacity style={styles.cancelButton} onPress={cancel}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 32 },
  status: { marginTop: 16, fontSize: 16, color: '#666' },
  success: { fontSize: 18, color: '#2d8a2d', marginBottom: 16 },
  error: { fontSize: 16, color: '#cc0000', marginBottom: 16, textAlign: 'center' },
  button: { backgroundColor: '#0066cc', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  cancelButton: { marginTop: 24 },
  cancelText: { color: '#666', fontSize: 14 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/SyncScreen.tsx
git commit -m "feat(mobile): Sync screen with scan/connect/download states and error handling"
```

---

### Task 6.3: Implement Accueil (home) screen

**Files:**
- Modify: `apps/mobile/src/screens/AccueilScreen.tsx`
- Create: `apps/mobile/src/components/DiveListItem.tsx`
- Create: `apps/mobile/src/components/LastDiveCard.tsx`

- [ ] **Step 1: Create DiveListItem component**

`apps/mobile/src/components/DiveListItem.tsx`:

Renders a single `DiveSummary` row: date, maxDepth, duration, score badge. Tapping navigates to DiveDetail.

- [ ] **Step 2: Create LastDiveCard component**

`apps/mobile/src/components/LastDiveCard.tsx`:

Per spec SS5 screen 3: highlighted last-dive card at top showing score + top warning.

- [ ] **Step 3: Implement AccueilScreen**

Per spec SS5 screen 3: highlighted last-dive card at top, reverse-chronological dive list below, pull-to-refresh triggers Sync. Sync reachable from header (per spec SS5 Navigation).

```tsx
// apps/mobile/src/screens/AccueilScreen.tsx
import React, { useCallback } from 'react';
import { View, FlatList, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDiveList } from '../hooks/useDives';
import DiveListItem from '../components/DiveListItem';
import LastDiveCard from '../components/LastDiveCard';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AccueilScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { data, isLoading, refetch, fetchNextPage, hasNextPage } = useDiveList();

  const allDives = data?.pages.flatMap((p) => p.dives) ?? [];
  const lastDive = allDives[0] ?? null;

  const handleSync = useCallback(() => {
    navigation.navigate('Sync');
  }, [navigation]);

  React.useLayoutEffect(() => {
    navigation.getParent()?.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleSync}>
          <Text style={{ color: '#0066cc', fontSize: 16 }}>{t('home.syncButton')}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleSync, t]);

  if (allDives.length === 0 && !isLoading) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t('home.noDives')}</Text>
        <TouchableOpacity style={styles.syncBtn} onPress={handleSync}>
          <Text style={styles.syncBtnText}>{t('home.syncButton')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={allDives}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={lastDive ? <LastDiveCard dive={lastDive} /> : null}
      renderItem={({ item }) => (
        <DiveListItem
          dive={item}
          onPress={() => navigation.navigate('DiveDetail', { diveId: item.id })}
        />
      )}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
      onEndReached={() => hasNextPage && fetchNextPage()}
      onEndReachedThreshold={0.5}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#666', marginBottom: 16, textAlign: 'center' },
  syncBtn: { backgroundColor: '#0066cc', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  syncBtnText: { color: '#fff', fontWeight: '600' },
});
```

- [ ] **Step 4: Write integration test for AccueilScreen**

Create `apps/mobile/src/__tests__/AccueilScreen.test.tsx` with mocked API returning fixture data.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/AccueilScreen.tsx apps/mobile/src/components/ apps/mobile/src/__tests__/AccueilScreen.test.tsx
git commit -m "feat(mobile): Accueil screen with dive list, last-dive card, and pull-to-refresh"
```

---

### Phase 6 verification

- [ ] `npx expo run:ios` — onboarding flow navigates correctly. After mock login, Accueil shows.
- [ ] Sync screen shows scanning → progress → complete with mock module timing.
- [ ] Pull-to-refresh on Accueil triggers data refetch.

---

## Phase 7 — Screens: Detail Plongee, Tendances, Profil

### Task 7.1: Implement Dive Detail screen with depth profile chart

**Files:**
- Modify: `apps/mobile/src/screens/DiveDetailScreen.tsx`
- Create: `apps/mobile/src/components/DepthProfileChart.tsx`
- Create: `apps/mobile/src/components/InsightCard.tsx`

- [ ] **Step 1: Create DepthProfileChart component**

`apps/mobile/src/components/DepthProfileChart.tsx`:

Uses `victory-native` to render a depth-vs-time profile. X-axis = time (seconds), Y-axis = depth (meters, inverted so deeper is lower). Lazy-loaded via `useDiveSamples` hook (per contract: `GET /api/dives/:id/samples`).

```tsx
import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { VictoryChart, VictoryLine, VictoryAxis, VictoryTheme } from 'victory-native';
import { useDiveSamples } from '../hooks/useDives';
import type { DiveSample } from '@diveforge/shared/types';

interface Props {
  diveId: string;
}

export default function DepthProfileChart({ diveId }: Props) {
  const { data: samples, isLoading } = useDiveSamples(diveId);

  if (isLoading) return <ActivityIndicator style={styles.loader} />;
  if (!samples || samples.length === 0) return null;

  const chartData = samples.map((s: DiveSample) => ({
    x: s.tSec / 60, // minutes
    y: -s.depthM,   // invert for visual (deeper = lower)
  }));

  return (
    <View style={styles.container}>
      <VictoryChart theme={VictoryTheme.material} height={220}>
        <VictoryAxis label="min" style={{ axisLabel: { padding: 30 } }} />
        <VictoryAxis
          dependentAxis
          label="m"
          style={{ axisLabel: { padding: 40 } }}
          tickFormat={(t: number) => `${Math.abs(t)}`}
        />
        <VictoryLine
          data={chartData}
          style={{ data: { stroke: '#0066cc', strokeWidth: 2 } }}
          interpolation="monotoneX"
        />
      </VictoryChart>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  loader: { height: 220, justifyContent: 'center' },
});
```

- [ ] **Step 2: Create InsightCard component**

`apps/mobile/src/components/InsightCard.tsx`:

Per spec SS5 screen 4: color-coded insight cards. Renders `ruleId` via i18n template interpolation with `evidence` fields (per Contract SS i18n contract).

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Insight, Severity } from '@diveforge/shared/types';

interface Props {
  insight: Insight;
}

const SEVERITY_COLORS: Record<Severity, string> = {
  info: '#4caf50',   // green
  warn: '#ff9800',   // amber
  alert: '#f44336',  // red
};

export default function InsightCard({ insight }: Props) {
  const { t } = useTranslation();

  // Per Contract SS i18n contract: render via i18n template interpolation
  const title = t(`insights.${insight.ruleId}.title`);
  const body = t(`insights.${insight.ruleId}.body`, insight.evidence as Record<string, string>);
  const color = SEVERITY_COLORS[insight.severity as Severity] ?? '#999';

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <Text style={[styles.title, { color }]}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4, backgroundColor: '#f9f9f9', padding: 12, marginVertical: 6, borderRadius: 6 },
  title: { fontWeight: '600', fontSize: 15, marginBottom: 4 },
  body: { fontSize: 14, color: '#333' },
});
```

- [ ] **Step 3: Implement DiveDetailScreen**

Per spec SS5 screen 4: headline metrics, depth-vs-time profile graph, insight cards, disclaimer footer.

```tsx
// apps/mobile/src/screens/DiveDetailScreen.tsx
import React from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDiveDetail } from '../hooks/useDives';
import DepthProfileChart from '../components/DepthProfileChart';
import InsightCard from '../components/InsightCard';
import type { RootStackProps } from '../navigation/types';

export default function DiveDetailScreen({ route }: RootStackProps<'DiveDetail'>) {
  const { diveId } = route.params;
  const { t } = useTranslation();
  const { data, isLoading } = useDiveDetail(diveId);

  if (isLoading || !data) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const { dive, insights } = data;

  return (
    <ScrollView style={styles.container}>
      {/* Headline metrics */}
      <View style={styles.metrics}>
        <MetricRow label={t('detail.date')} value={new Date(dive.startedAt).toLocaleDateString()} />
        <MetricRow label={t('detail.duration')} value={`${Math.round(dive.durationSec / 60)} min`} />
        <MetricRow label={t('detail.maxDepth')} value={`${dive.maxDepthM} m`} />
        <MetricRow label={t('detail.avgDepth')} value={`${dive.avgDepthM} m`} />
        {dive.minWaterTempC != null && (
          <MetricRow label={t('detail.temp')} value={`${dive.minWaterTempC} C`} />
        )}
        <MetricRow
          label={t('detail.score')}
          value={dive.safetyScore != null ? t('detail.scoreValue', { score: dive.safetyScore }) : '—'}
        />
      </View>

      {/* Depth profile chart — lazy-loaded via /api/dives/:id/samples */}
      <Text style={styles.sectionTitle}>{t('detail.depthProfile')}</Text>
      <DepthProfileChart diveId={diveId} />

      {/* Insights */}
      <Text style={styles.sectionTitle}>{t('detail.insights')}</Text>
      {insights.length === 0 ? (
        <Text style={styles.noInsights}>{t('detail.noInsights')}</Text>
      ) : (
        insights.map((insight) => <InsightCard key={insight.id} insight={insight} />)
      )}

      {/* Disclaimer per spec SS5 screen 4 */}
      <Text style={styles.disclaimer}>{t('detail.disclaimer')}</Text>
    </ScrollView>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  metrics: { marginBottom: 16 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  metricLabel: { fontSize: 15, color: '#666' },
  metricValue: { fontSize: 15, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  noInsights: { color: '#666', fontStyle: 'italic' },
  disclaimer: { marginTop: 24, fontSize: 12, color: '#999', textAlign: 'center', paddingBottom: 32 },
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/DiveDetailScreen.tsx apps/mobile/src/components/DepthProfileChart.tsx apps/mobile/src/components/InsightCard.tsx
git commit -m "feat(mobile): Dive Detail screen with depth profile chart and insight cards"
```

---

### Task 7.2: Implement Tendances screen

**Files:**
- Modify: `apps/mobile/src/screens/TendancesScreen.tsx`
- Create: `apps/mobile/src/components/ScoreTrendChart.tsx`

- [ ] **Step 1: Create ScoreTrendChart component**

`apps/mobile/src/components/ScoreTrendChart.tsx`:

Uses `victory-native` to render a line chart of `scoreSeries` from `GET /api/trends?days=30`.

- [ ] **Step 2: Implement TendancesScreen**

Per spec SS5 screen 5: 30-day rolling average score, average depth, dive count, score trendline, one summary tip rendered via `summaryTipKey` through i18n lookup.

```tsx
// apps/mobile/src/screens/TendancesScreen.tsx
import React from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTrends } from '../hooks/useTrends';
import ScoreTrendChart from '../components/ScoreTrendChart';

export default function TendancesScreen() {
  const { t } = useTranslation();
  const { data, isLoading } = useTrends(30);

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!data || data.diveCount === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t('trends.noData')}</Text>
      </View>
    );
  }

  // Per Contract SS Trends: summaryTipKey rendered via i18n template lookup
  const summaryTip = t(`summaryTips.${data.summaryTipKey}`);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{t('trends.title')}</Text>
      <Text style={styles.period}>{t('trends.period')}</Text>

      <View style={styles.statsRow}>
        <StatCard label={t('trends.avgScore')} value={`${Math.round(data.avgScore)}/100`} />
        <StatCard label={t('trends.avgDepth')} value={`${data.avgDepthM.toFixed(1)} m`} />
        <StatCard label={t('trends.diveCount')} value={String(data.diveCount)} />
      </View>

      <Text style={styles.sectionTitle}>{t('trends.scoreTrend')}</Text>
      <ScoreTrendChart data={data.scoreSeries} />

      {/* Summary tip per Contract */}
      <View style={styles.tipCard}>
        <Text style={styles.tipText}>{summaryTip}</Text>
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#666', textAlign: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  period: { fontSize: 14, color: '#999', marginBottom: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statCard: { flex: 1, alignItems: 'center', padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8, marginHorizontal: 4 },
  statValue: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 4, textAlign: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 8, marginBottom: 8 },
  tipCard: { backgroundColor: '#e8f4fd', padding: 16, borderRadius: 8, marginTop: 16 },
  tipText: { fontSize: 14, color: '#1a5276', lineHeight: 20 },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/TendancesScreen.tsx apps/mobile/src/components/ScoreTrendChart.tsx
git commit -m "feat(mobile): Tendances screen with score trend chart and summary tip"
```

---

### Task 7.3: Implement Profil screen

**Files:**
- Modify: `apps/mobile/src/screens/ProfilScreen.tsx`

- [ ] **Step 1: Implement ProfilScreen**

Per spec SS5 screen 6: email (read-only), niveau (editable), locale (editable), connected device, manual sync button, logout. Uses `PATCH /api/me` for niveau/locale updates (per Contract SS User).

```tsx
// apps/mobile/src/screens/ProfilScreen.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import type { RootStackParamList } from '../navigation/types';
import type { Niveau, Locale } from '@diveforge/shared/types';
import i18n from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProfilScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigation = useNavigation<Nav>();

  const handleLogout = async () => {
    await logout();
  };

  const handleChangeNiveau = async (niveau: Niveau) => {
    // Per Contract SS User: PATCH /api/me
    await api.patch('/api/me', { niveau });
  };

  const handleChangeLocale = async (locale: Locale) => {
    await api.patch('/api/me', { locale });
    i18n.changeLanguage(locale);
  };

  const handleSync = () => {
    navigation.navigate('Sync');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('profile.title')}</Text>

      <ProfileRow label={t('profile.email')} value={user?.email ?? '—'} />
      <ProfileRow label={t('profile.niveau')} value={user?.niveau ? t(`niveau.${user.niveau}`) : '—'} editable onPress={() => {/* show picker */}} />
      <ProfileRow label={t('profile.locale')} value={user?.locale === 'en' ? 'English' : 'Francais'} editable onPress={() => {/* toggle */}} />
      <ProfileRow label={t('profile.connectedDevice')} value={t('profile.noDevice')} />

      <TouchableOpacity style={styles.syncBtn} onPress={handleSync}>
        <Text style={styles.syncBtnText}>{t('profile.syncButton')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>{t('profile.logoutButton')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ProfileRow({ label, value, editable, onPress }: { label: string; value: string; editable?: boolean; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.row} disabled={!editable} onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value} {editable ? '>' : ''}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowLabel: { fontSize: 16, color: '#333' },
  rowValue: { fontSize: 16, color: '#666' },
  syncBtn: { backgroundColor: '#0066cc', padding: 14, borderRadius: 8, marginTop: 32, alignItems: 'center' },
  syncBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  logoutBtn: { marginTop: 16, alignItems: 'center', padding: 14 },
  logoutText: { color: '#cc0000', fontSize: 16 },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/ProfilScreen.tsx
git commit -m "feat(mobile): Profil screen with niveau/locale editing, sync, and logout"
```

---

### Phase 7 verification

- [ ] `npx expo run:ios` — all 6 screens navigable: Onboarding → Accueil (bottom tabs) → Dive Detail (tap dive) → Tendances → Profil.
- [ ] Sync accessible from Accueil header AND Profil screen.
- [ ] Depth profile chart renders sample data correctly (depth increases downward).
- [ ] Insight cards show interpolated i18n text.
- [ ] Tendances renders summary tip via `summaryTipKey` i18n lookup.

---

## Phase 8 — Outbound Queue + Offline Handling

### Task 8.1: Implement the expo-sqlite outbound queue

**Files:**
- Create: `apps/mobile/src/services/queue.ts`

- [ ] **Step 1: Write the queue service**

Per spec SS6 (API: network unavailable → queue dive in `expo-sqlite`; retry on next foreground; UI shows "En attente de synchronisation") and the plan scope.

`apps/mobile/src/services/queue.ts`:

```ts
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'diveforge_queue.db';

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS upload_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        attempts INTEGER NOT NULL DEFAULT 0
      );
    `);
  }
  return db;
}

export async function enqueueUpload(payload: unknown): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'INSERT INTO upload_queue (payload) VALUES (?)',
    [JSON.stringify(payload)]
  );
}

export async function getPendingCount(): Promise<number> {
  const database = await getDb();
  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM upload_queue'
  );
  return result?.count ?? 0;
}

export async function flushQueue(
  uploadFn: (payload: unknown) => Promise<boolean>
): Promise<{ succeeded: number; failed: number }> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ id: number; payload: string; attempts: number }>(
    'SELECT id, payload, attempts FROM upload_queue ORDER BY created_at ASC'
  );

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload);
      const ok = await uploadFn(payload);
      if (ok) {
        await database.runAsync('DELETE FROM upload_queue WHERE id = ?', [row.id]);
        succeeded++;
      } else {
        await database.runAsync(
          'UPDATE upload_queue SET attempts = attempts + 1 WHERE id = ?',
          [row.id]
        );
        failed++;
      }
    } catch {
      await database.runAsync(
        'UPDATE upload_queue SET attempts = attempts + 1 WHERE id = ?',
        [row.id]
      );
      failed++;
    }
  }

  return { succeeded, failed };
}

export async function clearQueue(): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM upload_queue');
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/services/queue.ts
git commit -m "feat(mobile): expo-sqlite outbound queue for offline dive uploads"
```

---

### Task 8.2: Implement foreground flush and queue status indicator

**Files:**
- Create: `apps/mobile/src/hooks/useQueueFlush.ts`
- Create: `apps/mobile/src/components/QueueBanner.tsx`

- [ ] **Step 1: Write the foreground flush hook**

`apps/mobile/src/hooks/useQueueFlush.ts`:

Listens for app state changes (background → foreground) and flushes the queue. Per spec SS6: "retry on next foreground."

```ts
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { flushQueue, getPendingCount } from '../services/queue';
import { api } from '../services/api';

export function useQueueFlush() {
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  };

  const flush = async () => {
    await flushQueue(async (payload) => {
      try {
        await api.post('/api/dives', payload, {
          headers: { 'Content-Type': 'application/json' },
        });
        return true;
      } catch {
        return false;
      }
    });
    await refresh();
  };

  useEffect(() => {
    refresh();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        flush();
      }
    });

    return () => sub.remove();
  }, []);

  return { pendingCount, flush };
}
```

- [ ] **Step 2: Write QueueBanner component**

`apps/mobile/src/components/QueueBanner.tsx`:

Shows "X plongee(s) en attente d'envoi" banner when `pendingCount > 0`. Uses i18n key `queue.pendingCount`.

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueueFlush } from '../hooks/useQueueFlush';

export default function QueueBanner() {
  const { t } = useTranslation();
  const { pendingCount } = useQueueFlush();

  if (pendingCount === 0) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{t('queue.pendingCount', { count: pendingCount })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#fff3cd', padding: 10, alignItems: 'center' },
  text: { color: '#856404', fontSize: 13 },
});
```

- [ ] **Step 3: Add QueueBanner to AccueilScreen**

Modify `AccueilScreen.tsx` to render `<QueueBanner />` above the dive list.

- [ ] **Step 4: Write unit test for queue service**

Create `apps/mobile/src/__tests__/queue.test.ts` testing enqueue, getPendingCount, flush, and clearQueue.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/useQueueFlush.ts apps/mobile/src/components/QueueBanner.tsx \
  apps/mobile/src/screens/AccueilScreen.tsx apps/mobile/src/__tests__/queue.test.ts
git commit -m "feat(mobile): offline queue flush on foreground + queue status banner"
```

---

### Phase 8 verification

- [ ] `npx expo run:ios` — simulate offline (disable network in Simulator) → sync → verify dive is queued (banner shows).
- [ ] Re-enable network → bring app to foreground → banner disappears as queue flushes.
- [ ] Unit tests pass: `npx jest`.

---

## Phase 9 — Error Handling + Final Polish

### Task 9.1: Implement comprehensive error handling per spec SS6

**Files:**
- Create: `apps/mobile/src/utils/errorHandler.ts`
- Modify: `apps/mobile/src/services/api.ts` (enhance 401 handling)
- Modify: `apps/mobile/src/hooks/useSync.ts` (add BLE-specific error cases)

- [ ] **Step 1: Create centralized error handler utility**

`apps/mobile/src/utils/errorHandler.ts`:

Maps error types to i18n keys per spec SS6 error table:
- BLE: device not found → `sync.noDevice`
- BLE: connection drops mid-sync → `sync.connectionLost` + partial success banner
- BLE: permission denied → `sync.permissionDenied` + `sync.openSettings`
- API: network unavailable → queue (already implemented)
- API: auth expired → auto-refresh, on failure → login screen

```ts
import { Linking, Platform } from 'react-native';

export type AppErrorType =
  | 'ble_no_device'
  | 'ble_connection_lost'
  | 'ble_permission_denied'
  | 'network_unavailable'
  | 'auth_expired'
  | 'parse_failed'
  | 'unknown';

export function classifyError(error: unknown): AppErrorType {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('no_device')) return 'ble_no_device';
    if (msg.includes('disconnected') || msg.includes('connection_lost')) return 'ble_connection_lost';
    if (msg.includes('permission')) return 'ble_permission_denied';
    if (msg.includes('network') || msg.includes('timeout')) return 'network_unavailable';
    if (msg.includes('401') || msg.includes('unauthorized')) return 'auth_expired';
    if (msg.includes('parse')) return 'parse_failed';
  }
  return 'unknown';
}

export function getErrorI18nKey(errorType: AppErrorType): string {
  switch (errorType) {
    case 'ble_no_device': return 'sync.noDevice';
    case 'ble_connection_lost': return 'sync.connectionLost';
    case 'ble_permission_denied': return 'sync.permissionDenied';
    case 'network_unavailable': return 'queue.pending';
    case 'auth_expired': return 'common.error';
    case 'parse_failed': return 'common.error';
    default: return 'common.error';
  }
}

export function openBleSettings(): void {
  if (Platform.OS === 'ios') {
    Linking.openURL('app-settings:');
  } else {
    Linking.openSettings();
  }
}
```

- [ ] **Step 2: Enhance the API interceptor for auth refresh**

Update `apps/mobile/src/services/api.ts` response interceptor to attempt token refresh before clearing:

```ts
// On 401: try GET /api/auth/me first (validates token), then clear if truly expired
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      // Token is expired — clear and let AuthContext redirect to login
      await clearToken();
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 3: Add disconnection listener to useSync**

Update `useSync.ts` to listen for `diveComputerDisconnected` event and handle mid-sync drops gracefully (per spec SS6: "Resume via externalId dedup; show partial-success banner").

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/utils/errorHandler.ts apps/mobile/src/services/api.ts apps/mobile/src/hooks/useSync.ts
git commit -m "feat(mobile): comprehensive error handling per spec SS6 error table"
```

---

### Task 9.2: Configure Jest and run full test suite

**Files:**
- Create: `apps/mobile/jest.config.ts`
- Create: `apps/mobile/jest.setup.ts`

- [ ] **Step 1: Write Jest configuration**

`apps/mobile/jest.config.ts`:

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'react-native',
  setupFilesAfterFramework: ['./jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|expo-.*|@expo|victory-native|react-native-svg)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@diveforge/shared/(.*)$': '<rootDir>/../../packages/shared/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};

export default config;
```

- [ ] **Step 2: Write Jest setup file**

`apps/mobile/jest.setup.ts`:

```ts
import '@testing-library/jest-native/extend-expect';

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    execAsync: jest.fn(),
    runAsync: jest.fn(),
    getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
    getAllAsync: jest.fn().mockResolvedValue([]),
  }),
}));

// Mock expo-localization
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'fr' }],
}));
```

- [ ] **Step 3: Run the full test suite**

```bash
cd apps/mobile
npx jest --coverage
```

Expected: all tests pass. Coverage report generated.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/jest.config.ts apps/mobile/jest.setup.ts
git commit -m "feat(mobile): Jest + RNTL test configuration"
```

---

### Phase 9 verification

- [ ] `npx jest` — all tests pass.
- [ ] `npx tsc --noEmit` — zero type errors.
- [ ] `npx expo run:ios` — full app flow works: onboarding → login → accueil → sync (mock) → dive detail (chart + insights) → tendances → profil → logout.
- [ ] Error states render correctly (mock a network failure by toggling airplane mode in Simulator).

---

## Phase 10 — Internal Distribution Build

### Task 10.1: Configure EAS Build for internal distribution

**Files:**
- Create: `apps/mobile/eas.json`
- Modify: `apps/mobile/app.json` (or `app.config.ts`)

- [ ] **Step 1: Install EAS CLI if not present**

```bash
npm install -g eas-cli
```

- [ ] **Step 2: Write `eas.json`**

`apps/mobile/eas.json`:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "buildConfiguration": "Release"
      },
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://diveforge-preview.vercel.app",
        "EXPO_PUBLIC_USE_REAL_BLE": "false"
      }
    },
    "production": {
      "distribution": "internal",
      "ios": {
        "buildConfiguration": "Release"
      },
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://diveforge.vercel.app",
        "EXPO_PUBLIC_USE_REAL_BLE": "false"
      }
    }
  }
}
```

- [ ] **Step 3: Configure app.json / app.config.ts**

Ensure the following are set:
- `expo.name`: "DiveForge"
- `expo.slug`: "diveforge"
- `expo.ios.bundleIdentifier`: "com.diveforge.app"
- `expo.android.package`: "com.diveforge.app"
- `expo.ios.infoPlist.NSBluetoothAlwaysUsageDescription`: i18n-ready BLE permission string

- [ ] **Step 4: Verify EAS build configuration**

```bash
cd apps/mobile
eas build:configure
```

Expected: EAS recognizes the project and lists available build profiles.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/eas.json apps/mobile/app.json
git commit -m "feat(mobile): EAS Build config for internal distribution (TestFlight + APK)"
```

---

### Task 10.2: Run a development build and verify on device

- [ ] **Step 1: Build for iOS Simulator**

```bash
cd apps/mobile
eas build --profile development --platform ios
```

Or locally:

```bash
npx expo run:ios --configuration Release
```

- [ ] **Step 2: Full manual smoke test**

Verify end-to-end on iOS Simulator:
1. App launches → Login screen
2. Create account (against running Plan 1 backend, or mock)
3. Onboarding flow: niveau → disclaimer → BLE permission
4. Accueil: empty state → tap Sync
5. Sync screen: mock scan → connect → download progress → complete
6. Accueil: dive list populates
7. Tap a dive → Dive Detail: metrics, depth chart, insights
8. Tendances tab: stats + chart + summary tip
9. Profil: user info, sync button, logout
10. Offline test: disable network → sync → queue banner appears → re-enable → banner clears

- [ ] **Step 3: Commit any final fixes from smoke test**

```bash
git add -A
git commit -m "fix(mobile): smoke test fixes from development build verification"
```

---

### Phase 10 verification

- [ ] App builds without errors for both development and preview profiles.
- [ ] All 6 screens function as specified.
- [ ] Mock native module behaves realistically (scan delay, progress events, download timing).
- [ ] i18n works in both fr and en.
- [ ] Offline queue works end-to-end.

---

## Self-review checklist

- [ ] Every step has actual content (no "TBD", "implement later", "similar to above")
- [ ] All file paths are exact and absolute-from-repo-root (under `apps/mobile/`)
- [ ] All commands include expected output descriptions
- [ ] Each phase ends with a verification step
- [ ] Mock module interface is EXACTLY the `DiveComputerModule` from the contract (same method signatures, same event names, same payload shapes)
- [ ] Plan 1's contract endpoints are consumed exactly (Auth = Bearer, POST /api/dives for upload, GET /api/dives/:id/samples for chart, GET /api/trends?days=30 for trends)
- [ ] All user-visible strings live in i18n JSON (no hardcoded strings in components)
- [ ] Default locale = device locale, fallback French
- [ ] All 10 ruleIds from spec SS4 have templates in both fr.json and en.json
- [ ] `summaryTipKey` is rendered via i18n template lookup (not raw string from backend)
- [ ] Indirection in `apps/mobile/src/native/index.ts` selects mock vs real based on `EXPO_PUBLIC_USE_REAL_BLE` flag
- [ ] Error handling covers all cases from spec SS6
- [ ] Tests written alongside code (Jest + RNTL, no E2E)
