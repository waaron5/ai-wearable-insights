/**
 * SparklineChart — lightweight line chart for metric trends.
 *
 * Uses react-native-svg directly instead of recharts (not RN compatible).
 * Renders a simple area chart with the same visual style as the web version.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { useThemeColors } from "../hooks/useThemeColors";
import type { Metric } from "../services/api";

const METRIC_CONFIG: Record<
  string,
  { label: string; unit: string; colorKey: string; decimals: number }
> = {
  sleep_hours: { label: "Sleep", unit: "hrs", colorKey: "primary", decimals: 1 },
  hrv: { label: "HRV", unit: "ms", colorKey: "primary", decimals: 0 },
  resting_hr: { label: "Resting HR", unit: "bpm", colorKey: "warning", decimals: 0 },
  steps: { label: "Steps", unit: "", colorKey: "success", decimals: 0 },
};

function formatValue(value: number, decimals: number): string {
  if (decimals === 0) return Math.round(value).toLocaleString();
  return value.toFixed(decimals);
}

interface SparklineChartProps {
  metricType: string;
  data: Metric[];
}

export function SparklineChart({ metricType, data }: SparklineChartProps) {
  const colors = useThemeColors();
  const config = METRIC_CONFIG[metricType] || {
    label: metricType,
    unit: "",
    colorKey: "primary",
    decimals: 1,
  };

  const chartColor = (colors as Record<string, string>)[config.colorKey] || colors.primary;

  const sorted = [...data]
    .filter((m) => m.metric_type === metricType)
    .sort((a, b) => a.date.localeCompare(b.date));

  const chartData = sorted.map((m) => m.value);

  if (chartData.length === 0) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {config.label}
        </Text>
        <View style={styles.noData}>
          <Text style={[styles.noDataText, { color: colors.textMuted }]}>
            No data yet
          </Text>
        </View>
      </View>
    );
  }

  const latest = chartData[chartData.length - 1];
  const min = Math.min(...chartData);
  const max = Math.max(...chartData);
  const range = max - min || 1;
  const padding = range * 0.15;

  const CHART_WIDTH = 280;
  const CHART_HEIGHT = 80;

  // Build SVG path
  const points = chartData.map((val, i) => {
    const x = (i / (chartData.length - 1 || 1)) * CHART_WIDTH;
    const y =
      CHART_HEIGHT -
      ((val - (min - padding)) / (range + padding * 2)) * CHART_HEIGHT;
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${CHART_WIDTH} ${CHART_HEIGHT} L 0 ${CHART_HEIGHT} Z`;

  const gradientId = `grad-${metricType}`;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {config.label}
        </Text>
        <Text style={[styles.latestValue, { color: colors.text }]}>
          {formatValue(latest, config.decimals)}
          {config.unit ? (
            <Text style={[styles.unit, { color: colors.textSecondary }]}>
              {" "}
              {config.unit}
            </Text>
          ) : null}
        </Text>
      </View>
      <View style={styles.chartContainer}>
        <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={chartColor} stopOpacity={0.2} />
              <Stop offset="100%" stopColor={chartColor} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={areaPath} fill={`url(#${gradientId})`} />
          <Path
            d={linePath}
            stroke={chartColor}
            strokeWidth={2}
            fill="none"
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
  },
  latestValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  unit: {
    fontSize: 11,
    fontWeight: "400",
  },
  chartContainer: {
    height: 80,
  },
  noData: {
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  noDataText: {
    fontSize: 12,
  },
});
