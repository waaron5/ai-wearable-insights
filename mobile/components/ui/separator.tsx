/**
 * Separator — horizontal divider line.
 */

import React from "react";
import { View, type ViewStyle } from "react-native";
import { useThemeColors } from "../../hooks/useThemeColors";

interface SeparatorProps {
  style?: ViewStyle;
}

export function Separator({ style }: SeparatorProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        { height: 1, backgroundColor: colors.separator, width: "100%" },
        style,
      ]}
    />
  );
}
