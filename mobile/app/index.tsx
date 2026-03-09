/**
 * Root index — redirects based on auth state.
 * The AuthProvider handles navigation guards, so this just shows
 * a loading screen while the auth state is being determined.
 */

import { ActivityIndicator, View, StyleSheet } from "react-native";
import { useAuth } from "../components/auth-provider";
import { useThemeColors } from "../hooks/useThemeColors";

export default function IndexScreen() {
  const { loading } = useAuth();
  const colors = useThemeColors();

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // AuthProvider handles routing — this screen is a brief flash
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
