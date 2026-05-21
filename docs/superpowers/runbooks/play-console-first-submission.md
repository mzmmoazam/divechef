# Play Console — first AAB submission

End-to-end runbook for shipping the first DiveChef AAB to Play Console internal testing.
Estimated time: 1 hour of operator clicking + 1-3 day Play Console first-app review wait.

## Prerequisites

- Google account (the one you'll use as Play Console owner).
- Credit/debit card for the $25 one-time Play Console developer fee.
- The latest mobile main commit merged with foundation code (P4 task 1-8).
- `npx eas-cli@latest --version` works locally.

## 1. Sign up for Play Console ($25 one-time)

1. Go to https://play.google.com/console
2. Sign in with the Google account you want to own the app.
3. Choose "Personal" account type (faster verification than "Organization" for solo devs).
4. Pay $25 with a credit card.
5. Verify email + phone if prompted.
6. Wait for approval — usually instant for personal accounts.

## 2. Register `com.divechef.app` as a new app

In Play Console → "Create app":

- App name: `DiveChef`
- Default language: `English (United States)` — en-US
- App or game: App
- Free or paid: Free
- Declarations:
  - "Developer Program Policies" — check
  - "US export laws" — check

After creation, the app dashboard appears. Now complete the required setup tasks listed under "Set up your app".

## 3. Required setup forms (before first AAB upload)

Play Console blocks AAB uploads until these are filled. Do them in this order:

### App access
- Choose "All functionality is available without special access" — true; the beta is invite-only at the Play Console level, not via in-app gating.

### Ads
- "Does your app contain ads?" → No

### Content rating
Click "Start questionnaire". Answer truthfully:
- Email: your support email
- Category: choose **Reference, News, or Educational**
- Violence: No
- Sexual content: No
- Profanity: No
- Drugs/alcohol/tobacco: No
- User-generated content: No (other users can't see your dives)
- Functionality: Health & Fitness checkbox = optional (you can leave off; we're a logging tool not a medical device)
- Calculate rating

Result: IARC rating "Everyone" or "Everyone 10+" depending on questionnaire details.

### Target audience
- Target ages: 16+ (matches `/privacy`)
- Are children part of audience? → No

### News apps
- Is your app a news app? → No

### COVID-19 contact tracing
- No

### Data safety
This is the most detailed form. Mirror what `/privacy` says.
- Data collection: Yes
- Data types collected:
  - **Personal info → Email address** (account, beta waitlist) — Required, Used for account function + app communication
  - **Personal info → Name** (display name) — Optional, account function
  - **Personal info → Other** (certification level, locale) — Optional, app personalization
  - **App activity → App interactions** (dives logged) — Required, app functionality
  - **App activity → Other** (device serial number, dive computer model, BLE-advertised name, firmware version) — Required, app functionality
  - **App info and performance → Crash logs** (Sentry) — Required, analytics + bug fixing
  - **App info and performance → Diagnostics** (Sentry traces) — Required, analytics
- Data sharing: No (we don't share with third parties beyond Sentry/Vercel as processors)
- Data security:
  - Encrypted in transit: Yes
  - Users can request data deletion: Yes — via support email and in-app account deletion
  - Adheres to families policy: N/A (not targeting children)
  - Independent security review: No

### Government apps
- No

### Financial features
- No

### Health
- "Health" toggle → No (we're a logging tool, not regulated medical software)

### App category & contact details
- Category: Health & Fitness OR Sports → choose **Sports** (closer fit; Health & Fitness can imply medical device)
- Tags: scuba diving, dive log, fitness tracking
- Email: support@divechef.com (or your contact email until forwarding is set up)
- Phone: optional
- Website: https://www.divechef.com
- Privacy policy URL: https://www.divechef.com/privacy

### Store listing
- App name: DiveChef
- Short description (≤80 chars): `Personal dive intelligence. Sync your Shearwater. Score every dive.`
- Full description (≤4000 chars): copy from the landing hero + how-it-works + tier descriptions, expanded slightly for SEO
- App icon: 512×512 PNG (export from `apps/mobile/assets/icon.png` if it's already 1024×1024; otherwise replace with a real designed asset)
- Feature graphic: 1024×500 PNG (placeholder — solid `#0a1220` background with "DiveChef" wordmark in cyan/white). Tools: Figma, Canva, or use an online generator.
- Phone screenshots (2-8): Take 2-4 screenshots from your phone or simulator running the dev build. Hero screen + sync screen + dive detail are the natural picks.

## 4. Create a Google service account for `eas submit`

`eas submit` needs a service account JSON to upload AABs.

1. Go to https://console.cloud.google.com → select or create a Google Cloud project.
2. APIs & Services → Library → search "Google Play Android Developer API" → Enable.
3. IAM & Admin → Service Accounts → Create service account.
   - Name: `eas-play-submit`
   - Role: leave blank (we grant via Play Console, not Cloud IAM)
4. Click the new service account → Keys → Add Key → Create new key → JSON → Download.
5. **Save the JSON file securely** (e.g., `~/.config/divechef/eas-play-submit.json`). Do NOT commit it.

Now grant Play Console access to the service account:

1. Play Console → Setup → API access
2. "Link your Google Cloud project" → select the project from step 1 above.
3. Find your service account in the list → "Grant access".
4. Permissions: tick "Release manager" → save.

## 5. First-time AAB upload (manual via web UI for the very first version)

Play Console requires the FIRST version of a brand-new app to be uploaded via the web UI (not via the API / `eas submit`). After that, all subsequent versions can use `eas submit`.

1. Run locally:

```bash
cd apps/mobile
npx eas-cli build --profile production --platform android
```

This queues a build on EAS Build (free tier: ~15-30 min queue + build). When done, EAS prints a download URL for the AAB.

2. Download the AAB to your machine.

3. Play Console → Testing → Internal testing → Create new release.

4. Upload the AAB. Play Console may complain about missing pieces — go back and fill them in. Common gotchas:
   - "Designed for Tablet": optional
   - "Developer description" / release notes: write something like "Closed beta build 1. Initial submission for internal testing."

5. Save → Review release → Start rollout to Internal testing.

## 6. Configure internal tester list

1. Play Console → Testing → Internal testing → Testers.
2. "Create email list" → name it "DiveChef beta testers".
3. Add emails (your Google account email + 1-2 friends' emails).
4. Save the list and assign it to the internal testing track.
5. Copy the "Web URL" opt-in link.

## 7. Wait for first-app review

Brand-new apps undergo a one-time review even for internal testing. Usually 1-3 days. You'll get an email when approved.

## 8. Subsequent uploads via `eas submit`

After approval, future builds can submit programmatically:

1. Set the service account JSON path as an EAS secret (one-time):

```bash
cd apps/mobile
eas credentials  # interactive; or use:
# eas submit --profile production --platform android --service-account-key-path /absolute/path/to/eas-play-submit.json
```

2. Subsequent rolls:

```bash
cd apps/mobile
npx eas-cli build --profile production --platform android
npx eas-cli submit --profile production --platform android --latest
```

The `--latest` flag uploads the most recent build for that profile/platform.

## 9. Onboard testers

For each tester:
1. Add their Google account email to the tester list (Step 6).
2. Send them the opt-in URL via email/Telegram/whatever.
3. They click → opt in → install from Play Store with "Internal testing" badge.

## Verification (definition of "Play Console runbook done")

- [ ] You can install DiveChef on your phone via the Play Store internal-test link.
- [ ] You can sign up + log a fake dive in the app.
- [ ] At least one friend tester is on the list and has been able to opt in.

## Common errors

- **"Version code already used"**: Bump `versionCode` (autoIncrement should handle this; if it doesn't, manually bump in app.json).
- **"App bundle's signing key not registered with Play"**: First-time builds register a new key. If you've previously signed with a different key (e.g., during a Cloud Console mistake), you need to enroll Play App Signing — Play Console will prompt.
- **`eas submit` says "Forbidden"**: service account doesn't have Release manager permission yet. Re-check Step 4.
