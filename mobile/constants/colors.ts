/**
 * VitalView color palette — ported from web CSS variables.
 * Uses the "Clean Modern" teal palette from color-palette.md.
 *
 * All colors are hex values for React Native StyleSheet compatibility.
 */

export const colors = {
  light: {
    // Brand & Interactive
    primary: "#00A896",
    primaryLight: "#3BC4B6",
    primaryDark: "#007D6F",
    primaryForeground: "#FFFFFF",

    // Status
    success: "#22C55E",
    error: "#EF4444",
    warning: "#F59E0B",
    neutral: "#CBD5E1",

    // Structural
    background: "#FFFFFF",
    surface: "#F8FAFC",
    card: "#FFFFFF",
    border: "#E2E8F0",
    separator: "#F1F5F9",

    // Text
    text: "#0F172A",
    textSecondary: "#64748B",
    textMuted: "#94A3B8",

    // Specific
    tabBar: "#FFFFFF",
    tabBarBorder: "#E2E8F0",
    tabBarActive: "#00A896",
    tabBarInactive: "#94A3B8",
  },

  dark: {
    // Brand & Interactive
    primary: "#2DD4BF",
    primaryLight: "#5EEAD4",
    primaryDark: "#14B8A6",
    primaryForeground: "#042F2E",

    // Status
    success: "#4ADE80",
    error: "#F87171",
    warning: "#FBBF24",
    neutral: "#475569",

    // Structural
    background: "#0F172A",
    surface: "#1E293B",
    card: "#1E293B",
    border: "#334155",
    separator: "#1E293B",

    // Text
    text: "#F8FAFC",
    textSecondary: "#94A3B8",
    textMuted: "#64748B",

    // Specific
    tabBar: "#0F172A",
    tabBarBorder: "#1E293B",
    tabBarActive: "#2DD4BF",
    tabBarInactive: "#64748B",
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type ThemeColors = (typeof colors)["light"] | (typeof colors)["dark"];
