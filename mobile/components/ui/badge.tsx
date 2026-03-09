/**
 * Badge component — small status pill.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useThemeColors } from "../../hooks/useThemeColors";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

interface BadgeProps {
  children: string;
  variant?: BadgeVariant;
}

export function Badge({ children, variant = "default" }: BadgeProps) {
  const colors = useThemeColors();

  const bgColors: Record<BadgeVariant, string> = {
    default: colors.primary + "20",
    secondary: colors.border,
    destructive: colors.error + "20",
    outline: "transparent",
  };

  const textColorMap: Record<BadgeVariant, string> = {
    default: colors.primary,
    secondary: colors.textSecondary,
    destructive: colors.error,
    outline: colors.textSecondary,
  };

  const borderColorMap: Record<BadgeVariant, string> = {
    default: "transparent",
    secondary: "transparent",
    destructive: "transparent",
    outline: colors.border,
  };

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bgColors[variant],
          borderColor: borderColorMap[variant],
        },
      ]}
    >
      <Text style={[styles.text, { color: textColorMap[variant] }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
  },
});
