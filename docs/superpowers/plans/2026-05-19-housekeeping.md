# Housekeeping — M1 follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Date:** 2026-05-19
**Status:** Ready for execution.
**Source:** Non-blocking follow-ups from the M1 final review.

**Goal:** Sweep up the small stuff M1's reviewer flagged so it doesn't accumulate. Four small tasks:

1. Delete pre-existing stale iOS clones at `apps/mobile/ios/PeregrineBLEManager.swift` + `DiveComputerModule 2.swift` + `PeregrineProtocol.swift` + `DiveComputer-Bridging-Header.h` (outside the build set; they predate M1 but confuse `grep`).
2. Rename iOS dispatch queue label `"com.divechef.peregrine-ble"` → `"com.divechef.shearwater-ble"` to match the M1 class rename.
3. Rename Android dlog prefix `"PeregrineBleManager: "` → `"ShearwaterPetrelManager: "` likewise.
4. Add `scripts/bootstrap-worktree.sh` so future M-task implementers don't have to manually copy gitignored iOS/Android build inputs from main into their worktree.

**Architecture:** Pure cleanup. Each task is independent; all four can land in any order on a single `housekeeping` branch in one worktree. No tests change behavior; we just verify the existing test suites stay green.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/mobile/ios/PeregrineBLEManager.swift` | **Delete** | Stale clone outside the Xcode build set. |
| `apps/mobile/ios/PeregrineProtocol.swift` | **Delete** | Same — stale clone. |
| `apps/mobile/ios/DiveComputerModule 2.swift` | **Delete** | Stale clone with copy-paste suffix. |
| `apps/mobile/ios/DiveComputerModule 2.m` | **Delete** | Same. |
| `apps/mobile/ios/DiveComputer-Bridging-Header.h` | **Delete** | Stale top-level header; the real one lives in `DiveComputer/`. |
| `apps/mobile/ios/DiveComputer/ShearwaterPetrelManager.swift` | **Modify** | Rename dispatch queue label. |
| `apps/mobile/android/app/src/main/java/com/divechef/ble/ShearwaterPetrelManager.kt` | **Modify** | Rename dlog prefix. |
| `scripts/bootstrap-worktree.sh` | **Create** | Copies gitignored iOS/Android build inputs from main into the current worktree + runs `pod install`. |

---

## Task 1: Delete pre-existing stale iOS clones

These files are tracked in git but referenced nowhere by `DiveChef.xcodeproj/project.pbxproj`. They predate M1 and the M1 final review confirmed they're not introduced by M1.

### Step 1: Confirm they're not referenced

```bash
cd /Users/mzmmoazam/Documents/Projects/diveForge

grep -l "ios/PeregrineBLEManager.swift\|ios/PeregrineProtocol.swift\|ios/DiveComputerModule 2" \
  apps/mobile/ios/DiveChef.xcodeproj/project.pbxproj || echo "Not referenced — safe to delete."
```

Expected: `Not referenced — safe to delete.` (i.e., grep finds zero matches.)

### Step 2: Delete

```bash
git rm "apps/mobile/ios/PeregrineBLEManager.swift" \
       "apps/mobile/ios/PeregrineProtocol.swift" \
       "apps/mobile/ios/DiveComputerModule 2.swift" \
       "apps/mobile/ios/DiveComputerModule 2.m" \
       "apps/mobile/ios/DiveComputer-Bridging-Header.h"
```

(Some of those files may not exist — `git rm` will error per-missing-file. List actual existing files first via `ls "apps/mobile/ios/"*.swift "apps/mobile/ios/"*.m "apps/mobile/ios/"*.h 2>/dev/null` and only `git rm` what's there.)

### Step 3: Run iOS test suite to confirm nothing broke

(Bootstrap the worktree first using Task 4's script, or follow M1 Task 4's manual steps.)

```bash
cd apps/mobile/ios
xcodebuild test \
  -workspace DiveChef.xcworkspace -scheme DiveChef \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:DiveChefTests 2>&1 | grep -E "Executed|TEST " | tail -3
cd ../../..
```

Expected: 86 tests pass. The deleted files were never built so the build is unaffected.

### Step 4: Commit

```bash
git commit -m "chore(ios): delete pre-existing stale clones outside DiveComputer/

Five files at apps/mobile/ios/ root that were tracked but unreferenced
by DiveChef.xcodeproj/project.pbxproj. Predated M1; flagged in the M1
final review as confusing because grep -r still found old class names
in them.

Confirmed not in the build set (pbxproj has no references). 86 iOS
tests still pass.

No production behavior change."
```

---

## Task 2: Rename iOS dispatch queue label

Cosmetic alignment with the M1 class rename. The label is internal — only visible in Xcode's Threads inspector during debugging.

### Step 1: Find the line

```bash
grep -n "peregrine-ble" apps/mobile/ios/DiveComputer/ShearwaterPetrelManager.swift
```

Expected: one line.

### Step 2: Edit

In `apps/mobile/ios/DiveComputer/ShearwaterPetrelManager.swift`, find:

```swift
private let queue = DispatchQueue(label: "com.divechef.peregrine-ble", qos: .userInitiated)
```

Replace with:

```swift
private let queue = DispatchQueue(label: "com.divechef.shearwater-ble", qos: .userInitiated)
```

### Step 3: Run tests, commit

```bash
xcodebuild test -workspace apps/mobile/ios/DiveChef.xcworkspace -scheme DiveChef \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:DiveChefTests 2>&1 | tail -3

git add apps/mobile/ios/DiveComputer/ShearwaterPetrelManager.swift
git commit -m "chore(ios): align DispatchQueue label with the class rename

shearwater-ble matches ShearwaterPetrelManager. Internal label only —
visible in Xcode's Threads debug view, no user-facing or behavioral
change."
```

---

## Task 3: Rename Android dlog prefix

### Step 1: Find the line

```bash
grep -n "PeregrineBleManager" apps/mobile/android/app/src/main/java/com/divechef/ble/ShearwaterPetrelManager.kt
```

Expected: one line — the `dlog` helper.

### Step 2: Edit

In `apps/mobile/android/app/src/main/java/com/divechef/ble/ShearwaterPetrelManager.kt`, find:

```kotlin
android.util.Log.d("DiveChef", "PeregrineBleManager: $message")
```

Replace with:

```kotlin
android.util.Log.d("DiveChef", "ShearwaterPetrelManager: $message")
```

### Step 3: Test + commit

```bash
cd apps/mobile/android && \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
./gradlew :app:testDebugUnitTest 2>&1 | tail -3
cd ../../..

git add apps/mobile/android/app/src/main/java/com/divechef/ble/ShearwaterPetrelManager.kt
git commit -m "chore(android): align dlog prefix with the class rename

logcat lines now show 'ShearwaterPetrelManager:' instead of
'PeregrineBleManager:'. Cosmetic only — visible in dev/diagnostic
output, no user-facing change."
```

---

## Task 4: Add `scripts/bootstrap-worktree.sh`

When a new git worktree is created (e.g. for an M-task subagent), the gitignored iOS `apps/mobile/ios/DiveChef/` directory and the Android gradle wrapper / `res/` / properties files don't propagate. M1 implementers worked around this by manually copying. This script automates the copy + runs `pod install` so the worktree is build-ready in one command.

### Step 1: Create the script

Create `scripts/bootstrap-worktree.sh`:

```bash
#!/usr/bin/env bash
# bootstrap-worktree.sh — Make a freshly-created git worktree build-ready.
#
# When a new worktree is created via `git worktree add`, gitignored files
# (Expo-regenerated iOS app shell, Android gradle wrapper + res/, etc.)
# don't propagate from the source worktree. This script copies them from
# main's working tree and runs pod install. Idempotent: safe to re-run.
#
# Usage:
#   cd .claude/worktrees/<branch> && bash <repo-root>/scripts/bootstrap-worktree.sh
# OR (from anywhere with the worktree as the second arg):
#   bash scripts/bootstrap-worktree.sh /path/to/.claude/worktrees/<branch>

set -euo pipefail

WORKTREE_DIR="${1:-$PWD}"
SOURCE_DIR="$(git -C "$WORKTREE_DIR" worktree list | head -1 | awk '{print $1}')"

if [ "$WORKTREE_DIR" = "$SOURCE_DIR" ]; then
  echo "Refusing to bootstrap the source worktree onto itself."
  exit 1
fi

echo "Source: $SOURCE_DIR"
echo "Target: $WORKTREE_DIR"

# --- iOS ---
if [ -d "$SOURCE_DIR/apps/mobile/ios/DiveChef" ] && \
   [ ! -d "$WORKTREE_DIR/apps/mobile/ios/DiveChef" ]; then
  echo "Copying iOS app shell (DiveChef/)…"
  cp -R "$SOURCE_DIR/apps/mobile/ios/DiveChef" "$WORKTREE_DIR/apps/mobile/ios/DiveChef"
fi

# Pods/ is also gitignored. We trigger a fresh install rather than copy
# (Pods are deterministic from the Podfile + Podfile.lock).
if [ ! -d "$WORKTREE_DIR/apps/mobile/ios/Pods" ] && \
   command -v pod >/dev/null 2>&1; then
  echo "Running pod install…"
  ( cd "$WORKTREE_DIR/apps/mobile/ios" && pod install ) >/dev/null 2>&1 || \
    echo "  pod install failed — proceed and re-run manually if iOS tests are needed."
fi

# --- Android ---
ANDROID_FILES=(
  "gradlew"
  "gradlew.bat"
  "build.gradle"
  "settings.gradle"
  "gradle.properties"
  "app/build.gradle"
)
ANDROID_DIRS=(
  "gradle"
  "app/src/main/res"
)

for f in "${ANDROID_FILES[@]}"; do
  src="$SOURCE_DIR/apps/mobile/android/$f"
  dst="$WORKTREE_DIR/apps/mobile/android/$f"
  if [ -f "$src" ] && [ ! -f "$dst" ]; then
    echo "Copying android/$f…"
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
  fi
done

for d in "${ANDROID_DIRS[@]}"; do
  src="$SOURCE_DIR/apps/mobile/android/$d"
  dst="$WORKTREE_DIR/apps/mobile/android/$d"
  if [ -d "$src" ] && [ ! -d "$dst" ]; then
    echo "Copying android/$d/…"
    cp -R "$src" "$dst"
  fi
done

if [ -f "$WORKTREE_DIR/apps/mobile/android/gradlew" ]; then
  chmod +x "$WORKTREE_DIR/apps/mobile/android/gradlew"
fi

# Android local.properties — generate fresh
ANDROID_HOME_GUESS="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
if [ -d "$ANDROID_HOME_GUESS" ]; then
  echo "sdk.dir=$ANDROID_HOME_GUESS" > "$WORKTREE_DIR/apps/mobile/android/local.properties"
fi

echo "Worktree bootstrap complete."
```

### Step 2: Make executable + smoke test

```bash
chmod +x scripts/bootstrap-worktree.sh

# Quick syntax check
bash -n scripts/bootstrap-worktree.sh && echo "Syntax OK"
```

(Don't actually run it against the current worktree — it's a destructive-feeling operation and the cleanup branch is the source worktree, so the early-return refusing-self-bootstrap should fire.)

### Step 3: Document usage in the plan templates

Open `docs/superpowers/plans/2026-05-19-m1-shearwater-petrel-manager.md` and add at the very top, right under the **Status:** line:

```md
> **Worktree note:** If executing this plan in a fresh worktree, run
> `bash scripts/bootstrap-worktree.sh` from the worktree root before any
> `xcodebuild` or `gradlew` command. The script copies gitignored
> Expo-regenerated iOS/Android build inputs from main and runs
> `pod install`.
```

(Add the same note to `2026-05-19-m2-device-serial-migration.md`, `2026-05-19-m3-user-devices-api.md`, and any future M-task plan template.)

### Step 4: Commit

```bash
git add scripts/bootstrap-worktree.sh \
        docs/superpowers/plans/2026-05-19-m1-shearwater-petrel-manager.md \
        docs/superpowers/plans/2026-05-19-m2-device-serial-migration.md \
        docs/superpowers/plans/2026-05-19-m3-user-devices-api.md
git commit -m "chore(scripts): add bootstrap-worktree.sh + reference from plans

Automates the gitignored-files copy that M1 task implementers had to
do manually for both iOS (DiveChef/ shell + Pods/ via pod install) and
Android (gradle wrapper, build.gradle, settings.gradle, res/,
local.properties). Idempotent.

Each subsequent M-task plan now references this script in a 'Worktree
note' callout at the top, so future implementers don't waste time
re-discovering the bootstrap requirement."
```

---

## Self-Review

**1. Coverage:** All four flagged follow-ups addressed. Each is its own task; no cross-dependencies.

**2. Placeholder scan:** No "TBD"s. The bootstrap script is full content.

**3. Type / interface consistency:** Tasks 1-3 are pure deletions or string changes; no API surfaces. Task 4 adds a script with no callers (manual invocation pattern).

---

## Execution notes

- Runs in worktree `housekeeping` on branch `housekeeping`. 4 commits.
- Independent of M2 + M3 — pure cleanup. Can run fully parallel with both.
- The bootstrap script (Task 4) is a developer-experience improvement that benefits M2 and M3 implementers. If Housekeeping merges first, M2/M3 can use the script. If they merge first, M2/M3 implementers do the manual copy as M1 implementers did. Order of merge doesn't affect correctness.
