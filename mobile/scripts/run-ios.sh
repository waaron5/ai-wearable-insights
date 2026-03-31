#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$PROJECT_ROOT/ios"
WORKSPACE_PATH="$IOS_DIR/VitalView.xcworkspace"
SCHEME_NAME="VitalView"
DERIVED_DATA_PATH="$IOS_DIR/build"
CONFIGURATION="Debug"
SIMULATOR_NAME=""
APP_BUNDLE_ID=""

# Ensure user-installed gem executables are discoverable.
if command -v ruby >/dev/null 2>&1; then
  GEM_USER_BIN="$(ruby -e 'print Gem.user_dir')/bin"
  export PATH="$GEM_USER_BIN:$PATH"
fi

# CocoaPods under macOS system Ruby can fail unless Logger is preloaded.
export RUBYOPT="${RUBYOPT:+$RUBYOPT }-rlogger"

usage() {
  echo "Usage: npm run ios -- [--simulator <name>] [--configuration <Debug|Release>] [--bundle-id <id>]"
}

find_simulator_udid_by_name() {
  local requested_name="$1"

  xcrun simctl list devices available |
    grep -F "$requested_name" |
    grep -Eo '[A-F0-9-]{36}' |
    head -n 1
}

find_booted_simulator_udid() {
  xcrun simctl list devices available |
    grep '(Booted)' |
    grep -Eo '[A-F0-9-]{36}' |
    head -n 1
}

find_default_simulator_udid() {
  local booted_udid
  booted_udid="$(find_booted_simulator_udid || true)"
  if [[ -n "$booted_udid" ]]; then
    echo "$booted_udid"
    return
  fi

  xcrun simctl list devices available |
    grep 'iPhone' |
    grep -Eo '[A-F0-9-]{36}' |
    head -n 1
}

detect_bundle_id() {
  awk '
    /PRODUCT_BUNDLE_IDENTIFIER = / {
      gsub(/.*= /, "", $0)
      gsub(/;.*/, "", $0)
      gsub(/[[:space:]]/, "", $0)
      print $0
      exit
    }
  ' "$IOS_DIR/VitalView.xcodeproj/project.pbxproj"
}

simulator_name_from_udid() {
  local simulator_udid="$1"

  xcrun simctl list devices available | awk -v simulator_udid="$simulator_udid" '
    index($0, simulator_udid) {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+\([A-F0-9-]+\).*/, "", line)
      print line
      exit
    }
  '
}

ensure_pods_are_synced() {
  if [[ ! -f "$IOS_DIR/Pods/Manifest.lock" ]] || ! cmp -s "$IOS_DIR/Podfile.lock" "$IOS_DIR/Pods/Manifest.lock"; then
    echo "Installing CocoaPods dependencies..."
    (
      cd "$IOS_DIR"
      pod install
    )
  fi
}

ensure_metro_running() {
  # Check if Metro process is running and responding
  if pgrep -f "expo start.*--dev-client.*--port 8081" >/dev/null 2>&1 && curl -fsS http://127.0.0.1:8081/status >/dev/null 2>&1; then
    echo "Metro already running on port 8081"
    return
  fi
  
  # Kill any stale Metro processes to prevent port conflicts
  if pgrep -f "expo start.*--dev-client.*--port 8081" >/dev/null 2>&1; then
    echo "Cleaning up stale Metro process..."
    pkill -f "expo start.*--dev-client.*--port 8081"
    sleep 2
  fi

  mkdir -p "$PROJECT_ROOT/.expo"
  local metro_log_path="$PROJECT_ROOT/.expo/metro-ios.log"

  echo "Starting Metro in the background..."
  (
    cd "$PROJECT_ROOT"
    nohup npx expo start --dev-client --port 8081 --host localhost --non-interactive >"$metro_log_path" 2>&1 &
  )

  for _ in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:8081/status >/dev/null 2>&1; then
      echo "Metro is ready"
      return
    fi
    sleep 1
  done

  echo ""
  echo "Metro did not become ready within 60 seconds."
  echo "Check: $metro_log_path"
  echo ""
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --simulator|--device)
      if [[ $# -lt 2 ]]; then
        usage
        exit 1
      fi
      SIMULATOR_NAME="$2"
      shift 2
      ;;
    --configuration)
      if [[ $# -lt 2 ]]; then
        usage
        exit 1
      fi
      CONFIGURATION="$2"
      shift 2
      ;;
    --bundle-id)
      if [[ $# -lt 2 ]]; then
        usage
        exit 1
      fi
      APP_BUNDLE_ID="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$APP_BUNDLE_ID" ]]; then
  APP_BUNDLE_ID="$(detect_bundle_id || true)"
fi

if [[ -z "$APP_BUNDLE_ID" ]]; then
  echo ""
  echo "Unable to determine app bundle identifier."
  echo "Pass it explicitly: npm run ios -- --bundle-id com.example.app"
  echo ""
  exit 1
fi

# Xcode tools can be installed but still unusable until license is accepted.
if ! xcrun simctl list devices >/dev/null 2>&1; then
  echo ""
  echo "Xcode CLI is not ready for this account yet."
  echo "Ask an admin to run once: sudo xcodebuild -license accept"
  echo "Then rerun: npm run ios"
  echo ""
  exit 1
fi

if ! POD_VERSION="$(pod --version 2>&1)"; then
  echo ""
  echo "CocoaPods is not usable yet in this shell."
  echo "$POD_VERSION"
  echo ""
  echo "Try: gem install cocoapods --user-install --no-document"
  echo "Then rerun: npm run ios"
  echo ""
  exit 1
fi

echo "Using CocoaPods $POD_VERSION"

ensure_pods_are_synced

SIMULATOR_UDID=""
if [[ -n "$SIMULATOR_NAME" ]]; then
  SIMULATOR_UDID="$(find_simulator_udid_by_name "$SIMULATOR_NAME" || true)"
else
  SIMULATOR_UDID="$(find_default_simulator_udid || true)"
fi

if [[ -z "$SIMULATOR_UDID" ]]; then
  echo ""
  echo "No available iOS simulator was found."
  echo "Open Xcode and install at least one iOS simulator runtime, then rerun: npm run ios"
  echo ""
  exit 1
fi

SIMULATOR_NAME="$(simulator_name_from_udid "$SIMULATOR_UDID")"
echo "Using simulator $SIMULATOR_NAME ($SIMULATOR_UDID)"

xcrun simctl boot "$SIMULATOR_UDID" >/dev/null 2>&1 || true
open -a Simulator --args -CurrentDeviceUDID "$SIMULATOR_UDID"
xcrun simctl bootstatus "$SIMULATOR_UDID" -b

if [[ "$CONFIGURATION" == "Debug" ]]; then
  ensure_metro_running
fi

echo "Building $SCHEME_NAME for iOS Simulator ($CONFIGURATION)..."
xcodebuild \
  -workspace "$WORKSPACE_PATH" \
  -scheme "$SCHEME_NAME" \
  -configuration "$CONFIGURATION" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -destination "id=$SIMULATOR_UDID" \
  build

APP_PATH="$DERIVED_DATA_PATH/Build/Products/${CONFIGURATION}-iphonesimulator/VitalView.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo ""
  echo "Build completed but the app bundle was not found at: $APP_PATH"
  echo ""
  exit 1
fi

echo "Installing app..."
xcrun simctl install "$SIMULATOR_UDID" "$APP_PATH"

echo "Launching app..."
xcrun simctl launch "$SIMULATOR_UDID" "$APP_BUNDLE_ID"

echo ""
echo "VitalView is launching on $SIMULATOR_NAME"
if [[ "$CONFIGURATION" == "Debug" ]]; then
  echo "Metro log: $PROJECT_ROOT/.expo/metro-ios.log"
fi
echo ""
