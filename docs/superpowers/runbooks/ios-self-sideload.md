# iOS self-sideload via free Apple ID

How to install DiveChef on your iPhone for personal beta testing without the $99/year Apple Developer Program.

## Constraints (read first)

- The certificate Xcode auto-provisions for a free Apple ID expires every **7 days**. After expiry, the app refuses to launch — you reopen Xcode, hit ⌘R, and it re-signs.
- You can register up to **3 device IDs** per Apple ID for free signing. For self-only beta, fine.
- This path does NOT publish to TestFlight or App Store. Just to your physical iPhone.
- Anyone else who wants to test on iPhone needs you to enroll in Apple Developer Program ($99/year) → TestFlight.

## Prerequisites

- A Mac with Xcode 15+ installed (latest is best).
- Your iPhone, with a Lightning/USB-C cable.
- Your personal Apple ID (the one you use for App Store).
- The mobile foundation code merged to main (P4 tasks 1-8).

## 1. Add your Apple ID to Xcode

1. Open Xcode.
2. Xcode menu → Settings → Accounts.
3. Click "+" → Apple ID → sign in with your personal Apple ID.
4. After signing in, you'll see a "Personal Team" entry under your account.

## 2. Connect and trust your iPhone

1. Plug your iPhone into your Mac with USB.
2. On the phone: when prompted "Trust this computer?", tap Trust.
3. In Xcode: Window → Devices and Simulators → confirm your iPhone shows up under "Devices".
4. If your phone shows "Unavailable" with a yellow warning: usually means you need to wait for symbols to load (~1 min) or the iOS version is newer than Xcode supports (update Xcode if so).

## 3. Open the iOS workspace

```bash
cd /Users/<you>/path/to/diveForge/apps/mobile/ios
ls *.xcworkspace
```

You should see a `.xcworkspace` file (the exact name comes from the Expo prebuild — likely `DiveChef.xcworkspace`). **Open the workspace, not the xcodeproj** (the workspace pulls in the CocoaPods dependencies):

```bash
open *.xcworkspace
```

## 4. Configure signing

1. In Xcode's project navigator (left), click the top "DiveChef" node.
2. In the main pane, select the "DiveChef" target.
3. Click "Signing & Capabilities" tab.
4. Under "Signing":
   - Check "Automatically manage signing".
   - Team: choose your Personal Team.
   - Bundle Identifier should already be `com.divechef.app`. **Don't change it** unless you absolutely need to (changing it on a free Apple ID can cause provisioning conflicts).
5. Wait a few seconds. Xcode auto-provisions a development certificate. If it errors:
   - "Failed to register bundle identifier" → bundle ID is in use by another Apple ID's app. Workaround: change bundle ID temporarily to `com.divechef.app.<your-initials>` for self-test, but this means notifications/keychain don't carry over.
   - "Maximum number of free apps signed" (10 max per device) → revoke old apps in Xcode → Devices and Simulators.

## 5. Set the build destination

In Xcode's toolbar (top-left, next to play/stop):
- Click the device picker.
- Select your physical iPhone (not "Any iOS Device" or a simulator).

## 6. Build and run

- Press ⌘R (or click the Play button).
- First build: ~3-5 minutes. Subsequent builds: ~30 seconds.
- The app installs on your phone.

## 7. Trust the developer profile (one-time, on the phone)

The first time you launch DiveChef on your phone, iOS will refuse to open it ("Untrusted Developer"):

1. On your phone: Settings → General → VPN & Device Management.
2. Under "Developer App", you'll see your Apple ID.
3. Tap it → "Trust <your name>" → Trust.
4. Go back to the home screen → tap DiveChef.
5. App launches.

You only do this once per Apple ID per device.

## 8. Configure the API URL

Out of the box, the development build points at `http://localhost:3000` (per `eas.json` development profile). To test against production:

Option A: Run with production env locally (recommended for true beta testing):

1. In Xcode, edit Scheme: Product → Scheme → Edit Scheme.
2. Run → Arguments → Environment Variables.
3. Add `EXPO_PUBLIC_API_URL` = `https://www.divechef.com`.
4. Hit Close → ⌘R again.

Option B: Build via EAS development profile then sideload:

```bash
cd apps/mobile
npx eas-cli build --profile development --platform ios
```

EAS hands you an .ipa download URL. Drag the .ipa onto your connected device in Xcode → Devices → "Installed Apps" pane.

## 9. Re-sign cycle

Every 7 days, the cert expires. Symptoms: app refuses to launch ("Untrusted Developer" reappears, or just crashes silently).

To re-sign:
1. Plug your iPhone into your Mac.
2. Open Xcode → workspace from Step 3.
3. Hit ⌘R.

That's it. Cert renews automatically; takes ~30 seconds end-to-end if Xcode is already open.

If the cert renewal fails because Apple's auth changed (rare), the workaround is to:
1. Xcode → Settings → Accounts → click your Apple ID → Manage Certificates.
2. Right-click the expired "Apple Development" cert → Delete.
3. Click "+" → "Apple Development" → wait for issue.
4. ⌘R again.

## Verification (definition of "iOS sideload runbook done")

- [ ] DiveChef opens on your iPhone.
- [ ] You can sign up.
- [ ] You can pair your Shearwater dive computer (BLE permission prompt appears).
- [ ] A test sync completes successfully against `https://www.divechef.com/api`.

## When you eventually enroll in Apple Developer Program

You'll graduate from this runbook to the standard TestFlight pipeline:
1. Add `submit.production.ios` config to `eas.json`.
2. Generate an App Store Connect API key.
3. Run `eas build --profile production --platform ios && eas submit --profile production --platform ios`.
4. Configure TestFlight internal/external testers.

That's a separate runbook for the future.
