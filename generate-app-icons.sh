#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="frontend/src/assets/logo"
OUT_DIR="frontend/src/assets/logo/generated"
mkdir -p "$OUT_DIR"

IOS_SRC="$SRC_DIR/app-icon-ios.svg"
ANDROID_SRC="$SRC_DIR/app-icon-android.svg"

echo "📱 Generating iOS App Store icon (1024×1024)..."
rsvg-convert -w 1024 -h 1024 "$IOS_SRC" -o "$OUT_DIR/app-icon-ios-1024.png"

echo "📱 Generating Android Play Store icon (512×512)..."
rsvg-convert -w 512 -h 512 "$ANDROID_SRC" -o "$OUT_DIR/app-icon-android-512.png"

# Optional: legacy / lower-res variants used by some tools
echo "📱 Generating 192×192 (Android legacy)..."
rsvg-convert -w 192 -h 192 "$ANDROID_SRC" -o "$OUT_DIR/app-icon-android-192.png"

echo "📱 Generating 180×180 (iOS @3x)..."
rsvg-convert -w 180 -h 180 "$IOS_SRC" -o "$OUT_DIR/app-icon-ios-180.png"

echo "📱 Generating 120×120 (iOS @2x)..."
rsvg-convert -w 120 -h 120 "$IOS_SRC" -o "$OUT_DIR/app-icon-ios-120.png"

echo "📱 Generating favicon 48×48..."
rsvg-convert -w 48 -h 48 "$IOS_SRC" -o "$OUT_DIR/favicon-48.png"

echo "📱 Generating favicon 32×32..."
rsvg-convert -w 32 -h 32 "$IOS_SRC" -o "$OUT_DIR/favicon-32.png"

echo "📱 Generating favicon 16×16..."
rsvg-convert -w 16 -h 16 "$IOS_SRC" -o "$OUT_DIR/favicon-16.png"

echo ""
echo "✅ Done. Files in $OUT_DIR:"
ls -la "$OUT_DIR"