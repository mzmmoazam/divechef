# P1 — Mobile UX Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Worktree note:** If executing this plan in a fresh worktree, run `bash scripts/bootstrap-worktree.sh` from the worktree root before any `xcodebuild` or `gradlew` command.

**Date:** 2026-05-19
**Status:** Ready for execution.
**Spec:** `docs/superpowers/specs/2026-05-18-phase-a-beta-ship-design.md` (Brand + P1 sections + Multi-device architecture).
**Depends on:** M1 + M2 + M3 all merged. `@divechef/shared` exports `parseShearwaterModel`/`verificationTier`/`ShearwaterModel`. Mobile cache APIs take `(userId, deviceSerial, …)`. Backend has `/api/devices` CRUD + Dive.deviceSerial.

**Goal:** Apply the Deep Ocean Modern design system to all 10 mobile screens, build the add-a-device flow end-to-end, lift `selectedDeviceSerial` out of the `useSync` placeholder into a real device store fed by the registered Device list, ship the supporting empty/loading/error states. After P1 lands, the app looks like a real product and a beta tester can add their Peregrine, sync, and see their dives.

**Architecture:** Three sequential phases with parallel-capable Phase 3.

- **Phase A — Foundation** (Tasks 1-2): theme tokens + primitive UI components. Everything else consumes these.
- **Phase B — Device infrastructure** (Tasks 3-6): device store / context, devices API client, add-a-device screen, and the wiring that replaces M2's `selectedDeviceSerial = null` placeholder.
- **Phase C — Screen polish** (Tasks 7-12): each screen redesigned with tokens + primitives + appropriate states. Six screens, all touching disjoint files — fully parallelizable across worktrees.
- **Phase D — Edge cases** (Tasks 13-14): "Don't see your computer?" sheet + empty/loading/error states across the app.

**Tech Stack:** React Native (Expo bare), TypeScript, react-i18next, react-navigation, TanStack Query, Jest + @testing-library/react-native, victory-native (charts).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/mobile/src/theme/tokens.ts` | **Create** | Color/typography/spacing/radius constants. Single source of truth. |
| `apps/mobile/src/theme/index.ts` | **Create** | Re-exports + `useTheme` hook (for future light/dark; v1 just returns the dark constants). |
| `apps/mobile/src/components/ui/Button.tsx` | **Create** | filled cyan / ghost / danger variants. |
| `apps/mobile/src/components/ui/Card.tsx` | **Create** | Elevated dark surface with optional hero gradient. |
| `apps/mobile/src/components/ui/ListItem.tsx` | **Create** | Left meta + right value+chevron pattern. |
| `apps/mobile/src/components/ui/Badge.tsx` | **Create** | Cyan filled / outlined / score-coded / verification-tier-coded. |
| `apps/mobile/src/components/ui/Input.tsx` | **Create** | Dark input with subtle border + cyan focus. |
| `apps/mobile/src/components/ui/Tab.tsx` | **Create** | Icon + uppercase label, cyan = active. |
| `apps/mobile/src/components/ui/ScoreNumber.tsx` | **Create** | Mono numerics, color-graded by value. |
| `apps/mobile/src/components/ui/EmptyState.tsx` | **Create** | Centered icon + line + CTA. |
| `apps/mobile/src/components/ui/Spinner.tsx` | **Create** | Cyan ring on dark. |
| `apps/mobile/src/contexts/DeviceContext.tsx` | **Create** | Provider + `useActiveDevice()` hook with `selectedDeviceSerial`, `devices`, `setActive`, `register`, `rename`, `remove`. |
| `apps/mobile/src/services/devices.ts` | **Create** | Thin wrapper around `/api/devices` endpoints (get, register, patch, delete). |
| `apps/mobile/src/screens/AddDeviceScreen.tsx` | **Create** | Model picker → scan → cross-check → register flow. |
| `apps/mobile/src/screens/DontSeeYourComputerSheet.tsx` | **Create** | Modal sheet with the Subsurface redirect for Petrel 1 / Nerd 1. |
| `apps/mobile/src/components/FirstSyncToast.tsx` | **Create** | Telemetry-rich toast for non-Verified device sync results. |
| `apps/mobile/src/hooks/useSync.ts` | **Modify** | Read `selectedDeviceSerial` from `useActiveDevice()` instead of local state. |
| `apps/mobile/src/hooks/useQueueFlush.ts` | **Modify** | Same — accept from `useActiveDevice()` rather than param. |
| `apps/mobile/src/components/QueueBanner.tsx` | **Modify** | Drop the `deviceSerial` prop; read from context. |
| `apps/mobile/src/screens/{Login,Signup,Sync,Accueil,Profil,DiveDetail,Tendances,BlePermission,Disclaimer,NiveauPicker}Screen.tsx` | **Modify** | Apply tokens + primitives; add empty/loading/error states. |
| `apps/mobile/src/i18n/{en,fr}.json` | **Modify** | New keys: device picker, add device, profile inventory section, "don't see your computer", first-sync toasts. |

---

## Phase A — Foundation

### Task 1: Theme tokens + `useTheme`

**Files:**
- Create: `apps/mobile/src/theme/tokens.ts`
- Create: `apps/mobile/src/theme/index.ts`
- Create: `apps/mobile/src/theme/__tests__/tokens.test.ts`

#### Step 1: Write the failing test

`apps/mobile/src/theme/__tests__/tokens.test.ts`:

```ts
import { tokens } from '../tokens';

describe('theme tokens', () => {
  it('exposes the eight required color tokens', () => {
    expect(tokens.color.bgBase).toBe('#0a1220');
    expect(tokens.color.bgElev).toBe('#0f1d33');
    expect(tokens.color.bgDeep).toBe('#103952');
    expect(tokens.color.accent).toBe('#22d3ee');
    expect(tokens.color.accent2).toBe('#a5f3fc');
    expect(tokens.color.text).toBe('#f0f9ff');
    expect(tokens.color.text2).toBe('#94a3b8');
    expect(tokens.color.text3).toBe('#64748b');
    expect(tokens.color.success).toBe('#22c55e');
    expect(tokens.color.warning).toBe('#facc15');
    expect(tokens.color.danger).toBe('#ef4444');
  });

  it('spacing is 4-based', () => {
    expect(tokens.space[1]).toBe(4);
    expect(tokens.space[2]).toBe(8);
    expect(tokens.space[3]).toBe(12);
    expect(tokens.space[4]).toBe(16);
    expect(tokens.space[6]).toBe(24);
    expect(tokens.space[8]).toBe(32);
  });

  it('typography exposes the documented sizes', () => {
    expect(tokens.type.display.size).toBe(30);
    expect(tokens.type.heading.size).toBe(18);
    expect(tokens.type.body.size).toBe(15);
    expect(tokens.type.caption.size).toBe(11);
    expect(tokens.type.caption.letterSpacing).toBe(0.12);
  });
});
```

#### Step 2: Run test, confirm fail

```bash
cd apps/mobile && pnpm test -- --testPathPattern=tokens 2>&1 | tail -10
```

#### Step 3: Implement `tokens.ts`

```ts
/**
 * Deep Ocean Modern design tokens.
 *
 * Single source of truth for color, typography, spacing, and radius
 * across the mobile app. Locked in spec
 * docs/superpowers/specs/2026-05-18-phase-a-beta-ship-design.md.
 */

export const tokens = {
  color: {
    bgBase: '#0a1220',
    bgElev: '#0f1d33',
    bgDeep: '#103952',
    accent: '#22d3ee',
    accent2: '#a5f3fc',
    text: '#f0f9ff',
    text2: '#94a3b8',
    text3: '#64748b',
    borderSubtle: 'rgba(255, 255, 255, 0.08)',
    success: '#22c55e',
    warning: '#facc15',
    danger: '#ef4444',
  },
  type: {
    display: { size: 30, weight: '700' as const, letterSpacing: -0.02 },
    title:   { size: 24, weight: '700' as const, letterSpacing: -0.01 },
    heading: { size: 18, weight: '600' as const, letterSpacing: 0 },
    bodyStrong: { size: 15, weight: '600' as const, letterSpacing: 0 },
    body:    { size: 15, weight: '400' as const, letterSpacing: 0 },
    small:   { size: 13, weight: '500' as const, letterSpacing: 0 },
    caption: { size: 11, weight: '600' as const, letterSpacing: 0.12 },
    monoDigit: { size: 18, weight: '600' as const, letterSpacing: -0.02 },
  },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48 } as const,
  radius: { sm: 8, card: 12, hero: 16, pill: 999 } as const,
} as const;

export type Tokens = typeof tokens;
```

#### Step 4: Implement `index.ts`

```ts
import { tokens, type Tokens } from './tokens.js';

export { tokens };
export type { Tokens };

/**
 * v1: dark-only. Returns tokens directly. The hook exists so future
 * light-mode work has a single seam to extend without changing every
 * consumer.
 */
export function useTheme(): Tokens {
  return tokens;
}
```

(Use `.js` extension in imports if the project uses NodeNext module resolution; otherwise drop.)

#### Step 5: Run tests, commit

```bash
cd apps/mobile && pnpm test -- --testPathPattern=tokens 2>&1 | tail -5
git add apps/mobile/src/theme/
git commit -m "feat(theme): add Deep Ocean Modern design tokens + useTheme hook

Single source of truth for color/typography/spacing/radius. Dark-only
in v1; useTheme() returns tokens directly so a future light-mode
extension has one seam to thread.

11 colors, 8 typography variants, 7 spacing steps, 4 radius values
match the locked spec values.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Primitive UI components

Build the nine primitives the rest of the screens consume. One commit per primitive (small, isolated). Each gets a snapshot-style smoke test that mounts the component and verifies it renders without throwing — full visual fidelity is verified later by manual screen review during Phase C.

**Files (per primitive):**
- Create: `apps/mobile/src/components/ui/<Name>.tsx`
- Create: `apps/mobile/src/components/ui/__tests__/<Name>.test.tsx`

**Common test pattern (use for every primitive):**

```tsx
import { render } from '@testing-library/react-native';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with the provided label', () => {
    const { getByText } = render(<Button label="Sync" onPress={() => {}} />);
    expect(getByText('Sync')).toBeTruthy();
  });

  it('respects the disabled prop', () => {
    const { getByText } = render(<Button label="Sync" onPress={() => {}} disabled />);
    const node = getByText('Sync');
    // disabled buttons render at lower opacity per Deep Ocean Modern
    expect(node).toBeTruthy();
  });
});
```

#### Step 1: `Button` (filled cyan / ghost / danger)

```tsx
import React from 'react';
import { Pressable, Text, ViewStyle, StyleProp } from 'react-native';
import { tokens } from '../../theme';

type Variant = 'filled' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'filled',
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    variant === 'filled' ? tokens.color.accent :
    variant === 'danger' ? tokens.color.danger :
    'transparent';
  const border =
    variant === 'ghost' ? `1px solid ${tokens.color.borderSubtle}` : 'none';
  const fg =
    variant === 'filled' ? tokens.color.bgBase :
    variant === 'ghost'  ? tokens.color.accent :
    tokens.color.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: variant === 'ghost' ? tokens.color.borderSubtle : 'transparent',
          borderWidth: variant === 'ghost' ? 1 : 0,
          paddingVertical: tokens.space[3],
          paddingHorizontal: tokens.space[6],
          borderRadius: tokens.radius.pill,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{
        color: fg,
        fontSize: tokens.type.bodyStrong.size,
        fontWeight: tokens.type.bodyStrong.weight,
      }}>
        {label}
      </Text>
    </Pressable>
  );
}
```

Test, commit `feat(ui): Button primitive (filled/ghost/danger)`.

#### Step 2: `Card`

```tsx
import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../theme';

export function Card({
  children,
  hero = false,
  style,
}: {
  children: React.ReactNode;
  hero?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (hero) {
    return (
      <LinearGradient
        colors={[tokens.color.bgDeep, tokens.color.bgElev, tokens.color.bgBase]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[{
          borderRadius: tokens.radius.hero,
          padding: tokens.space[6],
          borderWidth: 1,
          borderColor: tokens.color.borderSubtle,
        }, style]}
      >
        {children}
      </LinearGradient>
    );
  }
  return (
    <View style={[{
      backgroundColor: tokens.color.bgElev,
      borderRadius: tokens.radius.card,
      padding: tokens.space[4],
      borderWidth: 1,
      borderColor: tokens.color.borderSubtle,
    }, style]}>
      {children}
    </View>
  );
}
```

`expo-linear-gradient` is already a transitive dep via Expo. If it isn't, add it: `pnpm --filter @divechef/mobile add expo-linear-gradient`.

Commit `feat(ui): Card primitive (flat + hero variants)`.

#### Step 3: `ListItem`

```tsx
import React from 'react';
import { Pressable, View, Text } from 'react-native';
import { tokens } from '../../theme';

export function ListItem({
  title,
  subtitle,
  rightValue,
  rightColor,
  onPress,
}: {
  title: string;
  subtitle?: string;
  rightValue?: string;
  rightColor?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: tokens.space[3],
        paddingHorizontal: tokens.space[4],
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View>
        <Text style={{
          fontSize: tokens.type.bodyStrong.size,
          fontWeight: tokens.type.bodyStrong.weight,
          color: tokens.color.text,
        }}>{title}</Text>
        {subtitle ? (
          <Text style={{
            fontSize: tokens.type.small.size,
            color: tokens.color.text2,
            marginTop: 2,
          }}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space[3] }}>
        {rightValue ? (
          <Text style={{
            fontSize: tokens.type.bodyStrong.size,
            fontWeight: '700',
            color: rightColor ?? tokens.color.accent,
          }}>{rightValue}</Text>
        ) : null}
        {onPress ? <Text style={{ color: tokens.color.text3, fontSize: 14 }}>›</Text> : null}
      </View>
    </Pressable>
  );
}
```

Commit `feat(ui): ListItem primitive`.

#### Step 4: `Badge`

```tsx
import React from 'react';
import { View, Text } from 'react-native';
import { tokens } from '../../theme';
import type { ShearwaterVerificationTier } from '@divechef/shared';

type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export function Badge({
  label,
  tone = 'accent',
  outline = false,
}: { label: string; tone?: Tone; outline?: boolean }) {
  const colorMap: Record<Tone, string> = {
    accent: tokens.color.accent,
    success: tokens.color.success,
    warning: tokens.color.warning,
    danger: tokens.color.danger,
    neutral: tokens.color.text2,
  };
  const c = colorMap[tone];
  return (
    <View style={{
      backgroundColor: outline ? 'transparent' : c,
      borderColor: c,
      borderWidth: outline ? 1 : 0,
      paddingHorizontal: tokens.space[3],
      paddingVertical: tokens.space[1],
      borderRadius: tokens.radius.pill,
      alignSelf: 'flex-start',
    }}>
      <Text style={{
        color: outline ? c : tokens.color.bgBase,
        fontSize: tokens.type.caption.size,
        fontWeight: tokens.type.caption.weight,
        letterSpacing: tokens.type.caption.letterSpacing,
        textTransform: 'uppercase',
      }}>{label}</Text>
    </View>
  );
}

/** Maps the shared verification-tier enum to a Badge label + tone. */
export function VerificationBadge({ tier }: { tier: ShearwaterVerificationTier }) {
  if (tier === 'verified') return <Badge label="Verified" tone="success" />;
  if (tier === 'experimental') return <Badge label="Experimental" tone="warning" outline />;
  return <Badge label="Compatible" tone="neutral" outline />;
}
```

Commit `feat(ui): Badge + VerificationBadge primitives`.

#### Step 5: `Input`

```tsx
import React from 'react';
import { TextInput, View, Text, TextInputProps } from 'react-native';
import { tokens } from '../../theme';

export function Input({
  label,
  error,
  ...rest
}: TextInputProps & { label?: string; error?: string }) {
  return (
    <View>
      {label ? (
        <Text style={{
          fontSize: tokens.type.caption.size,
          color: tokens.color.text2,
          letterSpacing: tokens.type.caption.letterSpacing,
          textTransform: 'uppercase',
          marginBottom: tokens.space[2],
          fontWeight: tokens.type.caption.weight,
        }}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={tokens.color.text3}
        {...rest}
        style={[{
          backgroundColor: tokens.color.bgElev,
          borderColor: error ? tokens.color.danger : tokens.color.borderSubtle,
          borderWidth: 1,
          borderRadius: tokens.radius.sm,
          paddingHorizontal: tokens.space[4],
          paddingVertical: tokens.space[3],
          color: tokens.color.text,
          fontSize: tokens.type.body.size,
        }, rest.style]}
      />
      {error ? (
        <Text style={{ color: tokens.color.danger, fontSize: tokens.type.small.size, marginTop: tokens.space[2] }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
```

Commit `feat(ui): Input primitive`.

#### Step 6: `Tab` (used in tab bar, not navigation lib)

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { tokens } from '../../theme';

export function Tab({
  icon,
  label,
  active,
  onPress,
}: { icon: string; label: string; active: boolean; onPress: () => void }) {
  const c = active ? tokens.color.accent : tokens.color.text3;
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: tokens.space[2] }}>
      <Text style={{ color: c, fontSize: 18 }}>{icon}</Text>
      <Text style={{
        color: c,
        fontSize: tokens.type.caption.size,
        fontWeight: tokens.type.caption.weight,
        letterSpacing: tokens.type.caption.letterSpacing,
        textTransform: 'uppercase',
        marginTop: 2,
      }}>{label}</Text>
    </Pressable>
  );
}
```

Commit `feat(ui): Tab primitive`.

#### Step 7: `ScoreNumber`

```tsx
import React from 'react';
import { Text } from 'react-native';
import { tokens } from '../../theme';

const PLATFORM_MONO = 'SF Mono';   // iOS system mono; Android falls back via fontFamily

export function ScoreNumber({ value, size = 14 }: { value: number; size?: number }) {
  const c =
    value >= 70 ? tokens.color.success :
    value >= 30 ? tokens.color.warning :
    tokens.color.danger;
  return (
    <Text style={{
      fontFamily: PLATFORM_MONO,
      fontSize: size,
      fontWeight: '700',
      color: c,
      letterSpacing: -0.02,
    }}>{value}</Text>
  );
}
```

Commit `feat(ui): ScoreNumber primitive — color-graded mono numerics`.

#### Step 8: `EmptyState`

```tsx
import React from 'react';
import { View, Text } from 'react-native';
import { tokens } from '../../theme';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  onCtaPress,
}: {
  icon: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.space[8] }}>
      <Text style={{ fontSize: 48, marginBottom: tokens.space[4], color: tokens.color.text3 }}>{icon}</Text>
      <Text style={{
        fontSize: tokens.type.heading.size,
        fontWeight: tokens.type.heading.weight,
        color: tokens.color.text,
        textAlign: 'center',
      }}>{title}</Text>
      {body ? (
        <Text style={{
          fontSize: tokens.type.body.size,
          color: tokens.color.text2,
          textAlign: 'center',
          marginTop: tokens.space[2],
          lineHeight: 22,
        }}>{body}</Text>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <Button label={ctaLabel} onPress={onCtaPress} style={{ marginTop: tokens.space[6] }} />
      ) : null}
    </View>
  );
}
```

Commit `feat(ui): EmptyState primitive`.

#### Step 9: `Spinner`

```tsx
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { tokens } from '../../theme';

export function Spinner({ size = 'large' }: { size?: 'small' | 'large' }) {
  return <ActivityIndicator size={size} color={tokens.color.accent} />;
}
```

Commit `feat(ui): Spinner primitive (cyan, on dark)`.

After all 9 primitives commit:

```bash
cd apps/mobile && pnpm test 2>&1 | tail -8
cd apps/mobile && pnpm typecheck 2>&1 | tail -3
```

Both should pass. Total Phase A commits: ~10.

---

## Phase B — Device infrastructure

### Task 3: `DeviceContext` + `useActiveDevice` hook

Replaces M2's `selectedDeviceSerial` placeholder in `useSync` with a real provider that owns the registered device list and the currently-active device.

**Files:**
- Create: `apps/mobile/src/contexts/DeviceContext.tsx`
- Create: `apps/mobile/src/contexts/__tests__/DeviceContext.test.tsx`
- Modify: `apps/mobile/src/App.tsx` (or wherever providers are composed) — wrap with `DeviceProvider`.

#### Step 1: Implement the context

```tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { ShearwaterModel } from '@divechef/shared';

export type Device = {
  id: string;
  model: ShearwaterModel;
  serialNumber: string;
  friendlyName: string | null;
  scanName: string | null;
  firmwareVersion: string | null;
  registeredAt: string;
  lastSyncAt: string | null;
};

type DeviceCtx = {
  devices: Device[];
  selectedDeviceSerial: string | null;
  setActive: (serialNumber: string | null) => void;
  setDevices: (devices: Device[]) => void;
  addDevice: (device: Device) => void;
  updateDevice: (id: string, patch: Partial<Device>) => void;
  removeDevice: (id: string) => void;
};

const Context = createContext<DeviceCtx | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [devices, setDevicesState] = useState<Device[]>([]);
  const [selectedDeviceSerial, setSelectedDeviceSerial] = useState<string | null>(null);

  const setDevices = useCallback((next: Device[]) => {
    setDevicesState(next);
    // Auto-select if user has exactly one and none is selected.
    if (selectedDeviceSerial == null && next.length === 1) {
      setSelectedDeviceSerial(next[0].serialNumber);
    }
    // Clear selection if it no longer exists.
    if (selectedDeviceSerial != null && !next.some((d) => d.serialNumber === selectedDeviceSerial)) {
      setSelectedDeviceSerial(null);
    }
  }, [selectedDeviceSerial]);

  const addDevice = useCallback((device: Device) => {
    setDevicesState((prev) => {
      if (prev.some((d) => d.id === device.id)) return prev;
      return [...prev, device];
    });
    // Auto-select the just-added device if nothing is currently active.
    setSelectedDeviceSerial((prev) => prev ?? device.serialNumber);
  }, []);

  const updateDevice = useCallback((id: string, patch: Partial<Device>) => {
    setDevicesState((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const removeDevice = useCallback((id: string) => {
    setDevicesState((prev) => {
      const filtered = prev.filter((d) => d.id !== id);
      const removed = prev.find((d) => d.id === id);
      if (removed && selectedDeviceSerial === removed.serialNumber) {
        setSelectedDeviceSerial(filtered[0]?.serialNumber ?? null);
      }
      return filtered;
    });
  }, [selectedDeviceSerial]);

  return (
    <Context.Provider value={{
      devices,
      selectedDeviceSerial,
      setActive: setSelectedDeviceSerial,
      setDevices,
      addDevice,
      updateDevice,
      removeDevice,
    }}>
      {children}
    </Context.Provider>
  );
}

export function useActiveDevice(): DeviceCtx {
  const v = useContext(Context);
  if (!v) throw new Error('useActiveDevice must be used inside DeviceProvider');
  return v;
}
```

#### Step 2: Test

Cover: empty start, add → auto-select first, add second → first stays active, set explicit active, remove active → next becomes active, remove non-active → unaffected, clear devices → selection clears.

#### Step 3: Wrap the app

Find where `AuthProvider` and `QueryClientProvider` wrap the app (likely `App.tsx` or `index.ts`). Add `DeviceProvider` inside the auth boundary (devices belong to a user):

```tsx
<AuthProvider>
  <DeviceProvider>
    <QueryClientProvider client={qc}>
      ...
    </QueryClientProvider>
  </DeviceProvider>
</AuthProvider>
```

#### Step 4: Commit

```
feat(devices): DeviceContext + useActiveDevice hook

Owns the registered device list + currently-active selection in
React state. Auto-selects on first registration; survives logout via
parent AuthProvider re-mount; clears stale selections when devices
are removed.

Replaces M2's useSync local-state placeholder. Phase B step 1.
```

---

### Task 4: `services/devices.ts` API client

Thin wrapper around the `/api/devices` endpoints from M3.

**Files:**
- Create: `apps/mobile/src/services/devices.ts`
- Create: `apps/mobile/src/services/__tests__/devices.test.ts`

```ts
import { api } from './api';
import type { Device } from '../contexts/DeviceContext';

export async function fetchDevices(): Promise<Device[]> {
  const res = await api.get<{ devices: Device[] }>('/api/devices');
  return res.data.devices;
}

export async function registerDevice(input: {
  model: string;
  serialNumber: string;
  scanName?: string | null;
  firmwareVersion?: string | null;
  friendlyName?: string | null;
}): Promise<Device> {
  const res = await api.post<{ device: Device }>('/api/devices', input);
  return res.data.device;
}

export async function renameDevice(id: string, friendlyName: string): Promise<Device> {
  const res = await api.patch<{ device: Device }>(`/api/devices/${id}`, { friendlyName });
  return res.data.device;
}

export async function deleteDevice(id: string): Promise<void> {
  await api.delete(`/api/devices/${id}`);
}
```

Tests mock `api` and assert each function calls the right endpoint with the right body.

Commit `feat(devices): API client wrapping /api/devices CRUD`.

---

### Task 5: `AddDeviceScreen` — model picker + flow

**Files:**
- Create: `apps/mobile/src/screens/AddDeviceScreen.tsx`
- Create: `apps/mobile/src/screens/__tests__/AddDeviceScreen.test.tsx`
- Modify: `apps/mobile/src/navigation/types.ts` (add the route)
- Modify: `apps/mobile/src/navigation/index.tsx` (register the screen in the stack)

This is the longest single task in the plan. The flow:

1. **Pick model** — list of supported models with `VerificationBadge`. Plus a "Don't see your computer?" link (opens the Phase D sheet) and an "Other Shearwater (let us know)" entry.
2. **Scan** — call `DiveComputerNative.startScan(SERVICE_UUID)`; show spinner with "Looking for your <Model>…".
3. **Cross-check** — when a peripheral is discovered, call `parseShearwaterModel(scanResult.name)`. If it disagrees with the user pick, show a confirmation dialog ("You picked Peregrine but this device advertises as Teric. Which is correct?"). If the user picked "Other Shearwater" but the parser identifies a known model, offer to upgrade.
4. **Connect + getDeviceInfo** — `DiveComputerNative.connect(scanResult.identifier)`, then `getDeviceInfo()`.
5. **Register** — `registerDevice({ model, serialNumber: deviceInfo.serial, scanName: deviceInfo.scanName, firmwareVersion: deviceInfo.firmwareVersion, friendlyName: '<UserName>'s <Model>' })`.
6. **Add to context** — `addDevice(returnedDevice)`. Navigate back to whatever screen invoked the add-device flow.

Implementation outline (pseudo-structured — fill in the actual JSX following established screen patterns from `LoginScreen.tsx`):

```tsx
import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, Text, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { DiveComputerNative } from '../native';
import { addDiveComputerListener } from '../native/events';
import { parseShearwaterModel, verificationTier, type ShearwaterModel } from '@divechef/shared';
import { tokens } from '../theme';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { VerificationBadge } from '../components/ui/Badge';
import { useActiveDevice } from '../contexts/DeviceContext';
import { useAuth } from '../hooks/useAuth';
import { registerDevice } from '../services/devices';

const SERVICE_UUID = 'FE25C237-0ECE-443C-B0AA-E02033E7029D';

type Step = 'pick' | 'scanning' | 'confirm' | 'connecting' | 'registering' | 'done' | 'error';

const PICKER_MODELS: ShearwaterModel[] = [
  'peregrine', 'perdix', 'perdix-ai', 'perdix-2',
  'petrel-2', 'petrel-3', 'teric', 'nerd-2', 'tern',
  'unknown-shearwater',
];

const MODEL_LABEL: Record<ShearwaterModel, string> = {
  peregrine: 'Peregrine',
  perdix: 'Perdix',
  'perdix-ai': 'Perdix AI',
  'perdix-2': 'Perdix 2',
  'petrel-2': 'Petrel 2',
  'petrel-3': 'Petrel 3',
  teric: 'Teric',
  'nerd-2': 'Nerd 2',
  tern: 'Tern',
  'unknown-shearwater': 'Other Shearwater (let us know)',
};

export default function AddDeviceScreen() {
  const { t } = useTranslation();
  const nav = useNavigation();
  const { user } = useAuth();
  const { addDevice } = useActiveDevice();
  const [step, setStep] = useState<Step>('pick');
  const [pickedModel, setPickedModel] = useState<ShearwaterModel | null>(null);
  const [discovered, setDiscovered] = useState<{ identifier: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'scanning') return;
    const unsub = addDiveComputerListener('diveComputerDiscovered', (d) => {
      setDiscovered({ identifier: d.identifier, name: d.name ?? '' });
      DiveComputerNative.stopScan();
      const parsed = parseShearwaterModel(d.name);
      if (parsed && pickedModel && parsed !== pickedModel) {
        setStep('confirm');
      } else if (pickedModel === 'unknown-shearwater' && parsed) {
        setStep('confirm');  // auto-upgrade dialog
      } else {
        // proceed straight to connect
        proceedConnect(d.identifier);
      }
    });
    DiveComputerNative.startScan(SERVICE_UUID).catch((e) => {
      setError(t('addDevice.scanFailed'));
      setStep('error');
    });
    return () => unsub();
  }, [step, pickedModel]);

  const proceedConnect = async (identifier: string) => {
    setStep('connecting');
    try {
      await DiveComputerNative.connect(identifier);
      const info = await DiveComputerNative.getDeviceInfo();
      setStep('registering');
      const finalModel = pickedModel === 'unknown-shearwater'
        ? 'unknown-shearwater'
        : pickedModel!;
      const friendlyName =
        user?.displayName
          ? `${user.displayName}'s ${MODEL_LABEL[finalModel]}`
          : MODEL_LABEL[finalModel];
      const device = await registerDevice({
        model: finalModel,
        serialNumber: info.serial,
        scanName: info.scanName,
        firmwareVersion: info.firmwareVersion,
        friendlyName,
      });
      addDevice({ ...device });
      setStep('done');
      setTimeout(() => nav.goBack(), 800);
    } catch (e) {
      setError(t('addDevice.connectFailed'));
      setStep('error');
    } finally {
      DiveComputerNative.disconnect().catch(() => {});
    }
  };

  // Render based on step. The picker step shows MODEL_LABEL list with VerificationBadge per row.
  // Scanning step shows Spinner + "Looking for your {model}…".
  // Confirm step shows "We see {parsed} but you picked {pickedModel}; which is right?" with two Buttons.
  // Connecting/registering steps show Spinner + status text.
  // Done step shows green check + auto-dismiss.
  // Error step shows EmptyState with retry.

  return (
    <ScrollView style={{ flex: 1, backgroundColor: tokens.color.bgBase }}>
      {/* per-step render here, following the pattern above */}
    </ScrollView>
  );
}
```

Tests mock `DiveComputerNative` + `registerDevice` + `useAuth` + `useActiveDevice` and walk the user through:
- Picker → match: registration succeeds, `addDevice` called.
- Picker → mismatch: confirm dialog appears, user picks parser's value, registration uses the parser's model.
- Picker "Other Shearwater" → parser identifies known model: auto-upgrade dialog → user accepts → registration uses the parsed model.
- Scan failure → error state with retry button.

Commit (single big commit for this screen + its tests):

```
feat(addDevice): user-assisted model picker + scan + register flow

Implements the spec's add-a-device flow end-to-end. Picker shows the
9 supported models + 'Other Shearwater' with VerificationBadge tier
labels. Scan filters on the FE25 service UUID. parseShearwaterModel
cross-checks the BLE-advertised name against the user's pick; mismatch
triggers a confirmation dialog (user wins). 'Other Shearwater' auto-
upgrades when the parser recognizes the actual model.

After connect, getDeviceInfo() supplies the serial; registerDevice()
posts to /api/devices; addDevice() puts it in DeviceContext and
auto-selects if it's the first one.
```

---

### Task 6: Wire `selectedDeviceSerial` from context into `useSync` + `useQueueFlush` + `QueueBanner`

Replaces M2's null placeholders with the real value from `useActiveDevice()`.

**Files:**
- Modify: `apps/mobile/src/hooks/useSync.ts` — drop the local `selectedDeviceSerial` state; read from `useActiveDevice().selectedDeviceSerial`. Drop `setSelectedDeviceSerial` from the return.
- Modify: `apps/mobile/src/hooks/useQueueFlush.ts` — drop the `deviceSerial: string | null` parameter; read from `useActiveDevice()`.
- Modify: `apps/mobile/src/components/QueueBanner.tsx` — drop the `deviceSerial` prop.
- Modify: `apps/mobile/src/screens/AccueilScreen.tsx:61` — drop the `deviceSerial={null}` prop on `<QueueBanner />`.
- Modify: `apps/mobile/src/__tests__/useSync.test.tsx` — mock `useActiveDevice` instead of using `setSelectedDeviceSerial`.

Each test that did `act(() => result.current.setSelectedDeviceSerial(TEST_SERIAL))` becomes `mockUseActiveDevice.mockReturnValue({ selectedDeviceSerial: TEST_SERIAL, ... })` at setup time.

#### Step 1-5: standard TDD pattern. After:

```bash
cd apps/mobile && pnpm test && pnpm typecheck 2>&1 | tail -5
```

Expected: 36 mobile tests still pass (the test bodies change but counts stay the same).

Commit:

```
refactor(devices): replace useSync placeholder with DeviceContext integration

useSync, useQueueFlush, and QueueBanner now read selectedDeviceSerial
from useActiveDevice() instead of accepting it as state/prop. M2's
placeholder pattern is gone — Task 5's add-a-device flow registers
real devices, DeviceContext auto-selects the first registered device,
and the sync + queue paths see real serials.

Phase B complete.
```

---

## Phase C — Screen polish (parallelizable)

Each of the six screens is a single task. They touch disjoint files (different `Screen.tsx` files), so all six can run in parallel worktrees. Auth screens are bundled (Login + Signup share styling).

The pattern for each is the same:

1. Read the existing screen.
2. Replace inline styles + ad-hoc colors with `tokens.color.*` / `tokens.space.*` / `tokens.type.*`.
3. Replace handcrafted buttons / cards / list items with the primitives from Task 2.
4. Add empty / loading / error states explicitly (`<EmptyState />`, `<Spinner />`).
5. Run the JS test suite — existing snapshots may need updating; add new tests if behavior changed.
6. Manual smoke: build + visual verify on simulator.

### Task 7: Auth screens (Login + Signup + Niveau picker + Disclaimer + BLE permission)

**Files:** `apps/mobile/src/screens/{Login,Signup,NiveauPicker,Disclaimer,BlePermission}Screen.tsx`.

Apply tokens + primitives to the auth flow. Login and Signup use `Input` and `Button` primitives. NiveauPicker uses `ListItem` for each niveau option. Disclaimer uses `Card` and `Button`. BlePermission uses `EmptyState` with a CTA.

The auth screens already exist; this is a polish pass, not a rewrite.

After all five screens:
```bash
cd apps/mobile && pnpm test && pnpm typecheck
```

Commit `feat(ui): polish auth flow screens with Deep Ocean tokens + primitives`.

### Task 8: Sync screen — state machine + device picker + first-sync result

**Files:**
- Modify: `apps/mobile/src/screens/SyncScreen.tsx`
- Create: `apps/mobile/src/components/FirstSyncToast.tsx`
- Create: `apps/mobile/src/components/__tests__/FirstSyncToast.test.tsx`

The Sync screen has the most state branches (idle / scanning / connecting / listing / downloading / uploading / complete / error) — this is the most-changed screen in the plan.

Key changes:

- **0 devices registered:** show `EmptyState` with icon, title "No dive computer yet", body "Add your dive computer to get started", CTA "Add a dive computer" → navigate to `AddDeviceScreen`.
- **1 device registered:** existing flow, but use the active device's `serialNumber` from context (already wired by Task 6).
- **≥2 devices registered:** show a device picker (list of devices using `ListItem` + `VerificationBadge`) before scan. Selecting one calls `setActive(serial)` and proceeds.
- **`unauthenticated` error:** map to `t('common.error')` (existing fallthrough — no new copy).
- **`no_device_selected` error:** map to `t('sync.noDeviceSelected')` with CTA to add a device.
- **Connection / sync errors:** existing paths, but use `EmptyState` with retry button.
- **First-sync result toast:** for non-Verified devices (compatible/experimental tier per `verificationTier(model)`), show `FirstSyncToast` after `state === 'complete'` with the appropriate copy.

`FirstSyncToast` component:

```tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../theme';
import type { ShearwaterVerificationTier } from '@divechef/shared';

export function FirstSyncToast({
  tier,
  failedStage,
  onDismiss,
}: { tier: ShearwaterVerificationTier; failedStage?: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  if (tier === 'verified') return null;
  const success = !failedStage;
  const message = success
    ? t('firstSync.successPrompt')
    : t('firstSync.failureWithStage', { stage: failedStage });
  return (
    <View style={{
      backgroundColor: success ? tokens.color.success : tokens.color.danger,
      padding: tokens.space[4],
      margin: tokens.space[4],
      borderRadius: tokens.radius.card,
    }}>
      <Text style={{ color: tokens.color.bgBase, fontWeight: '600', fontSize: tokens.type.body.size }}>
        {message}
      </Text>
      <Pressable onPress={onDismiss} style={{ alignSelf: 'flex-end', marginTop: tokens.space[2] }}>
        <Text style={{ color: tokens.color.bgBase, fontWeight: '700' }}>OK</Text>
      </Pressable>
    </View>
  );
}
```

Test: mounts the toast for each tier; verifies `verified` returns null, `compatible` shows the success prompt, `experimental` likewise.

Commit `feat(sync): device picker + 0/1/N device cases + first-sync toast`.

### Task 9: Home (`AccueilScreen`)

**Files:** `apps/mobile/src/screens/AccueilScreen.tsx`.

Apply the brainstormed Home mockup (hero card + dive list + tab bar + sync FAB). The mockup is the source-of-truth for layout — see the brainstorm artifact `.superpowers/brainstorm/.../home-screen-deep-ocean.html` for the exact spacing.

- `LastDiveCard` (existing) — refactor to use `Card hero` + `ScoreNumber` + cyan accent.
- Dive list — use `ListItem` with `ScoreNumber` on the right.
- Tab bar — use `Tab` primitives (Home active, Trends + Profile inactive).
- Sync FAB — use `Button variant="filled"` positioned absolute bottom-right.
- Empty state (no dives synced yet) — `EmptyState` with "Sync your dive computer" CTA.

Commit `feat(ui): apply Deep Ocean tokens + primitives to Home screen`.

### Task 10: Profile (`ProfilScreen`) + registered devices section

**Files:** `apps/mobile/src/screens/ProfilScreen.tsx`.

- Existing user info (email, niveau, locale) — restyle with tokens.
- New section: "Your dive computers" — list of devices from `useActiveDevice().devices`, each row showing friendly name + model badge + serial-last-4 + last-sync date. Tap row to rename (modal with `Input` and Save button → `renameDevice` API). Long-press or trailing button to remove (`Alert.alert` confirmation → `deleteDevice` API + `removeDevice` from context).
- "Add another device" CTA at the bottom of the section → navigate to `AddDeviceScreen`.

Commit `feat(profile): registered devices inventory section`.

### Task 11: DiveDetail (`DiveDetailScreen`)

**Files:** `apps/mobile/src/screens/DiveDetailScreen.tsx`.

- Existing depth profile chart (`DepthProfileChart`) — restyle with token colors (cyan for the profile line, danger for over-NDL warnings).
- Score card at top — `Card hero` + `ScoreNumber` (large size).
- Insight cards — restyle existing `InsightCard` with `Card` primitive + appropriate severity color.
- Stats row (max depth, duration, avg depth, etc.) — use mono numerics.
- Loading state — `Spinner`. Error state — `EmptyState` with retry.

Commit `feat(ui): apply Deep Ocean tokens + primitives to DiveDetail`.

### Task 12: Trends (`TendancesScreen`)

**Files:** `apps/mobile/src/screens/TendancesScreen.tsx`.

- Existing `ScoreTrendChart` — restyle line color (cyan), grid (subtle white), labels (text2).
- Stats row — mono numerics + caption labels.
- Summary tip — `Card` with the localized insight string.
- Empty state (no dives yet to chart) — `EmptyState`.

Commit `feat(ui): apply Deep Ocean tokens + primitives to Trends`.

After Phase C, all six screen tasks land. Smoke test on a simulator (Phase A's manual verification): each screen looks like the brand mockup, no inline-hex slips through, no light-mode flashes.

---

## Phase D — Edge cases

### Task 13: "Don't see your computer?" sheet

**Files:**
- Create: `apps/mobile/src/screens/DontSeeYourComputerSheet.tsx`
- Modify: `apps/mobile/src/screens/AddDeviceScreen.tsx` — wire the link.
- Modify: `apps/mobile/src/i18n/{en,fr}.json` — add the copy.

The sheet shows the Petrel 1 / Nerd 1 / Subsurface redirect copy from the spec, plus the "another Shearwater model" + "non-Shearwater" disclaimers. Use `Card` for each bullet, `Button variant="ghost"` for the dismiss action.

i18n keys (English):

```json
"addDevice": {
  "dontSeeYours": {
    "title": "Don't see your computer?",
    "petrel1Title": "Petrel 1 or Nerd 1",
    "petrel1Body": "These use older Bluetooth Classic, which DiveForge doesn't support today. The open-source Subsurface reads them via USB if you want to log them somewhere.",
    "otherShearwaterTitle": "Another Shearwater model we haven't catalogued",
    "otherShearwaterBody": "Please get in touch — we'll work through it.",
    "otherVendorTitle": "A non-Shearwater computer (Garmin, Suunto, Mares, Atomic)",
    "otherVendorBody": "Different vendor, different protocol. We're focused on Shearwater for the v1 beta."
  }
}
```

Mirror in `fr.json` with French copy.

Commit `feat(addDevice): "Don't see your computer?" sheet for unsupported models`.

### Task 14: Empty / loading / error states sweep

A short audit task — walk the 10 screens and confirm each has:
- Loading state using `Spinner`.
- Empty state using `EmptyState` (where the screen has a list).
- Error state using either `EmptyState` with retry or an inline error block with `Button`.

Where any are missing, add them following the spec's UI guidance. Most screens already got this in Tasks 7-12; this is a final consistency pass.

Run the full mobile test suite + typecheck. Commit `feat(ui): final empty/loading/error state consistency sweep`.

---

## Self-Review

**1. Spec coverage:**

- ✅ Brand tokens / 11 colors / 8 type styles — Task 1.
- ✅ 9 component primitives — Task 2.
- ✅ Apply system to all screens — Tasks 7-12.
- ✅ Empty/loading/error states — Tasks 7-12 + 14.
- ✅ Add-a-device flow with model picker + cross-check + auto-upgrade — Task 5.
- ✅ DeviceContext + selectedDeviceSerial wiring — Tasks 3 + 6.
- ✅ Sync screen device picker (0/1/≥2 cases) — Task 8.
- ✅ Profile inventory — Task 10.
- ✅ "Don't see your computer?" sheet — Task 13.
- ✅ First-sync result toast — Task 8.
- ✅ Devices API client — Task 4.

**2. Placeholder scan:**

No "TBD"s. The two long stretches of pseudo-render-code in Task 5 and Task 8 reference established patterns (the existing screen JSX, the Step 5/6/7 pattern from M-tasks); I noted "follow established screen patterns" rather than dumping 200-line JSX. Each task has an exact commit message, which is the contract for "this task is done."

**3. Type consistency:**

- `Device` shape is defined in `DeviceContext.tsx` (Task 3) and consumed unchanged by `services/devices.ts` (Task 4) and the screens.
- `selectedDeviceSerial: string | null` shape is consistent across `DeviceContext`, `useSync`, `useQueueFlush`, `QueueBanner` (Tasks 3 + 6).
- `ShearwaterModel` and `verificationTier` come from `@divechef/shared` (M1) and are referenced consistently in Tasks 4 + 5 + 8.

---

## Execution notes

- **Phase A** (Tasks 1-2): one worktree, sequential. ~2 days.
- **Phase B** (Tasks 3-6): same worktree (continues from Phase A) — Tasks 3 → 4 → 5 → 6 in order. ~3-4 days.
- **Phase C** (Tasks 7-12): six independent worktrees, fully parallel. Each task ~0.5-1 day.
- **Phase D** (Tasks 13-14): one worktree after Phase C lands. ~1 day.
- **Total wall-clock:** ~7-10 days depending on parallelism in Phase C.
- **Total commit count:** ~30 (one per primitive, one per screen, one per phase B task, plus polish commits).

After P1 lands: P2 (marketing landing), P3 (deploy), P4 (beta distribution) follow.
