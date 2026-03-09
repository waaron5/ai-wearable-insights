/**
 * useThemeColors — returns the current color palette based on system appearance.
 */

import { useColorScheme } from "react-native";
import { colors, type ThemeColors } from "../constants/colors";

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return colors[scheme === "dark" ? "dark" : "light"];
}
