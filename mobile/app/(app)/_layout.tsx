/**
 * App group layout — wraps the authenticated app area.
 */

import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
