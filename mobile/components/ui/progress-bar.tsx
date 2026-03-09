/**
 * Progress bar component — horizontal fill indicator.
 */

import React from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { useThemeColors } from "../../hooks/useThemeColors";

interface ProgressBarProps {
  value: number; // 0-100
  style?: ViewStyle;
  height?: number;
}

export function ProgressBar({ value, style, height = 6 }: ProgressBarProps) {
  const colors = useThemeColors();
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <View
      style={[
        styles.track,
        { backgroundColor: colors.border, height, borderRadius: height / 2 },
        style,
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            backgroundColor: colors.primary,
            width: `${clampedValue}%`,
            height,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
