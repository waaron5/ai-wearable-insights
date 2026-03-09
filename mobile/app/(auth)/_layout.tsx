/**
 * Auth group layout — used for login and signup screens.
 * No tab bar or navigation chrome.
 */

import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
  );
}
