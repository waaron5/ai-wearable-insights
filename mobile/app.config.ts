import { ExpoConfig, ConfigContext } from "expo/config";

const devApiUrl = process.env.DEV_API_URL;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "VitalView",
  slug: "vitalview",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "vitalview",
  userInterfaceStyle: "automatic",
  // Hermes JavaScript engine enabled (via Podfile) for faster startup & improved performance
  // New Arch (RCTNewArchEnabled) also enabled in Podfile - requires React Native 0.83+
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0f766e",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.vitalview.app",
    buildNumber: "1",
    // HealthKit and other iOS permissions managed here - single source of truth
    infoPlist: {
      NSHealthShareUsageDescription:
        "VitalView reads your health data (sleep, heart rate variability, resting heart rate, and steps) to generate personalized weekly health debriefs and track trends over time.",
      NSHealthUpdateUsageDescription:
        "VitalView only reads health data and does not write to your health records.",
      UIBackgroundModes: ["fetch", "remote-notification"],
    },
    // Read-only HealthKit entitlements - we never write data
    entitlements: {
      "com.apple.developer.healthkit.access": ["read"],
      "aps-environment": "development",
    },
    config: {
      usesNonExemptEncryption: false,
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    [
      "expo-notifications",
      {
        icon: "./assets/icon.png",
        color: "#0f766e",
      },
    ],
    [
      "expo-background-fetch",
      {
        startOnBoot: true,
      },
    ],
  ],
  extra: {
    devApiUrl,
    eas: {
      projectId: "your-eas-project-id",
    },
  },
});
