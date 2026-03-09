/**
 * Themed button component.
 *
 * Variants: primary (filled), outline, ghost, destructive
 * Sizes: sm, md, lg
 */

import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useThemeColors } from "../../hooks/useThemeColors";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  icon,
  style,
}: ButtonProps) {
  const colors = useThemeColors();

  const bgColors: Record<string, string> = {
    primary: colors.primary,
    outline: "transparent",
    ghost: "transparent",
    destructive: colors.error,
  };

  const textColors: Record<string, string> = {
    primary: colors.primaryForeground,
    outline: colors.text,
    ghost: colors.text,
    destructive: "#FFFFFF",
  };

  const borderColors: Record<string, string> = {
    primary: colors.primary,
    outline: colors.border,
    ghost: "transparent",
    destructive: colors.error,
  };

  const heights: Record<string, number> = { sm: 36, md: 44, lg: 52 };
  const fontSizes: Record<string, number> = { sm: 13, md: 15, lg: 17 };

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[
        styles.base,
        {
          backgroundColor: bgColors[variant],
          borderColor: borderColors[variant],
          height: heights[size],
          opacity: isDisabled ? 0.5 : 1,
          paddingHorizontal: size === "sm" ? 12 : size === "lg" ? 24 : 16,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={textColors[variant]}
          style={{ marginRight: 8 }}
        />
      ) : icon ? (
        <>{icon}</>
      ) : null}
      <Text
        style={[
          styles.text,
          {
            color: textColors[variant],
            fontSize: fontSizes[size],
          },
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
  } as ViewStyle,
  text: {
    fontWeight: "600",
  } as TextStyle,
});
