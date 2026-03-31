#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$PROJECT_ROOT/ios"

echo "Cleaning iOS build artifacts..."
rm -rf "$IOS_DIR/build"

echo "Cleaning Expo local state..."
rm -rf "$PROJECT_ROOT/.expo"

echo "Stopping Metro (if running)..."
pkill -f "expo start.*--dev-client.*--port 8081" >/dev/null 2>&1 || true

echo "Shutting down iOS simulators..."
xcrun simctl shutdown all >/dev/null 2>&1 || true

echo ""
echo "iOS cleanup complete."
echo "Next run: npm run ios (Debug) or npm run ios:demo (Release)"
echo ""
