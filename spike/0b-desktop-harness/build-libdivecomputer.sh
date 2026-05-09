#!/usr/bin/env bash
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$HARNESS_DIR/build"
SRC_DIR="$BUILD_DIR/libdivecomputer"
INSTALL_DIR="$BUILD_DIR/install"

mkdir -p "$BUILD_DIR"

if [[ ! -d "$SRC_DIR" ]]; then
  git clone https://github.com/libdivecomputer/libdivecomputer.git "$SRC_DIR"
fi

cd "$SRC_DIR"
git pull --ff-only || true

autoreconf --install
./configure --prefix="$INSTALL_DIR"
make -j"$(sysctl -n hw.ncpu)"
make install

echo
echo "Built and installed to: $INSTALL_DIR"
echo "Try: $INSTALL_DIR/bin/dctool --help"
