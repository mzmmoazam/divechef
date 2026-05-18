#!/usr/bin/env bash
# bootstrap-worktree.sh — Make a freshly-created git worktree build-ready.
#
# When a new worktree is created via `git worktree add`, gitignored files
# (Expo-regenerated iOS app shell, the Pods/ directory, the Xcode workspace,
# Android gradle wrapper + res/, etc.) don't propagate from the source
# worktree. This script copies what's needed from main's working tree, runs
# `pnpm install` (Podfile evaluates `node --print "require.resolve('expo/...')"`
# during pod install — needs node_modules), then runs `pod install`.
# Idempotent: safe to re-run.
#
# Usage:
#   cd .claude/worktrees/<branch> && bash <repo-root>/scripts/bootstrap-worktree.sh
# OR (from anywhere with the worktree as the second arg):
#   bash scripts/bootstrap-worktree.sh /path/to/.claude/worktrees/<branch>
#
# Compatible with macOS bash 3.2 (default `/bin/bash`) — no `set -u` to avoid
# the well-known empty-array expansion bug, no associative arrays.

set -eo pipefail

WORKTREE_DIR="${1:-$PWD}"
SOURCE_DIR="$(git -C "$WORKTREE_DIR" worktree list | head -1 | awk '{print $1}')"

if [ "$WORKTREE_DIR" = "$SOURCE_DIR" ]; then
  echo "Refusing to bootstrap the source worktree onto itself."
  exit 1
fi

echo "Source: $SOURCE_DIR"
echo "Target: $WORKTREE_DIR"

# --- pnpm install (required before pod install — Podfile resolves expo via node) ---
if [ ! -d "$WORKTREE_DIR/node_modules" ] && command -v pnpm >/dev/null 2>&1; then
  echo "Running pnpm install at workspace root…"
  ( cd "$WORKTREE_DIR" && pnpm install --frozen-lockfile ) || \
    echo "  pnpm install failed — proceed; iOS pod install will likely fail without it."
fi

# --- iOS ---
# DiveChef/ (the Expo-generated app shell) is gitignored — copy from source.
if [ -d "$SOURCE_DIR/apps/mobile/ios/DiveChef" ] && \
   [ ! -d "$WORKTREE_DIR/apps/mobile/ios/DiveChef" ]; then
  echo "Copying iOS app shell (DiveChef/)…"
  cp -R "$SOURCE_DIR/apps/mobile/ios/DiveChef" "$WORKTREE_DIR/apps/mobile/ios/DiveChef"
fi

# DiveChef.xcworkspace is gitignored (only DiveChef.xcodeproj is tracked).
# xcodebuild needs the workspace, so copy it.
if [ -d "$SOURCE_DIR/apps/mobile/ios/DiveChef.xcworkspace" ] && \
   [ ! -d "$WORKTREE_DIR/apps/mobile/ios/DiveChef.xcworkspace" ]; then
  echo "Copying iOS workspace (DiveChef.xcworkspace/)…"
  cp -R "$SOURCE_DIR/apps/mobile/ios/DiveChef.xcworkspace" \
        "$WORKTREE_DIR/apps/mobile/ios/DiveChef.xcworkspace"
fi

# Pods/ is gitignored — trigger a fresh install (deterministic from Podfile.lock).
if [ ! -d "$WORKTREE_DIR/apps/mobile/ios/Pods" ] && \
   command -v pod >/dev/null 2>&1; then
  echo "Running pod install…"
  ( cd "$WORKTREE_DIR/apps/mobile/ios" && pod install ) >/dev/null 2>&1 || \
    echo "  pod install failed — proceed and re-run manually if iOS tests are needed."
fi

# --- Android ---
# Iterate via space-separated lists instead of `${ARRAY[@]}` to stay safe on
# bash 3.2 (default macOS) where empty-array expansion under `set -u` errors.

ANDROID_FILES="gradlew gradlew.bat build.gradle settings.gradle gradle.properties app/build.gradle"
ANDROID_DIRS="gradle app/src/main/res"

for f in $ANDROID_FILES; do
  src="$SOURCE_DIR/apps/mobile/android/$f"
  dst="$WORKTREE_DIR/apps/mobile/android/$f"
  if [ -f "$src" ] && [ ! -f "$dst" ]; then
    echo "Copying android/$f…"
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
  fi
done

for d in $ANDROID_DIRS; do
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
