/**
 * Root layout — expo-router entry point.
 *
 * Houses the AuthProvider and navigation guards.
 * Delegates routing to child groups: (auth), (app), onboarding.
 */

import { useEffect } from "react";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "../components/auth-provider";
import { registerBackgroundSync } from "../services/healthkit-background";
import { useNotificationListeners } from "../services/push-notifications";

function NotificationSetup() {
  useNotificationListeners();
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    if (__DEV__) return;

    // Register background HealthKit sync on app start
    registerBackgroundSync().catch(console.warn);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        {!__DEV__ ? <NotificationSetup /> : null}
        <StatusBar style="auto" />
        <Slot />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
