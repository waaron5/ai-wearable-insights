/**
 * HighlightsStrip — displays debrief highlight cards in a row.
 * Ported from frontend/components/highlights-strip.tsx.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TrendingUp, TrendingDown, Minus } from "lucide-react-native";
import { useThemeColors } from "../hooks/useThemeColors";
import type { DebriefHighlight } from "../services/api";

function parseDelta(delta: string): { value: number; label: string } {
  const num = parseFloat(delta.replace(/[^-\d.]/g, ""));
  return { value: isNaN(num) ? 0 : num, label: delta };
}

export function HighlightsStrip({
  highlights,
}: {
  highlights: DebriefHighlight[];
}) {
  const colors = useThemeColors();

  if (!highlights || highlights.length === 0) return null;

  return (
    <View style={styles.grid}>
      {highlights.map((h) => {
        const delta = parseDelta(h.delta_vs_baseline);
        const isPositive = delta.value > 0;
        const isNegative = delta.value < 0;

        const deltaColor = isPositive
          ? "#22c55e"
          : isNegative
            ? "#ef4444"
            : colors.textMuted;

        return (
          <View
            key={h.label}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {h.label}
            </Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {h.value}
            </Text>
            <View style={styles.deltaRow}>
              {isPositive ? (
                <TrendingUp size={12} color={deltaColor} />
              ) : isNegative ? (
                <TrendingDown size={12} color={deltaColor} />
              ) : (
                <Minus size={12} color={deltaColor} />
              )}
              <Text style={[styles.deltaText, { color: deltaColor }]}>
                {delta.label} vs baseline
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
    flexBasis: "47%",
    flexGrow: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
  },
  value: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  deltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: "500",
  },
});
