/**
 * Dashboard screen — the main tab.
 *
 * Displays:
 * - Current debrief card
 * - Composite scores
 * - Highlights strip
 * - Sparkline charts for each metric type
 *
 * Ported from frontend/app/(app)/dashboard/_dashboard-client.tsx
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Heart, Sparkles } from "lucide-react-native";
import { useThemeColors } from "../../../hooks/useThemeColors";
import { useAuth } from "../../../components/auth-provider";
import { api } from "../../../services/api";
import type { Debrief, WeeklySummary, Metric } from "../../../services/api";
import { DebriefCard } from "../../../components/debrief-card";
import { HighlightsStrip } from "../../../components/highlights-strip";
import { SparklineChart } from "../../../components/sparkline-chart";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";

const METRIC_TYPES = ["sleep_hours", "hrv", "resting_hr", "steps"];

export default function DashboardScreen() {
  const colors = useThemeColors();
  const { user } = useAuth();
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [debriefRes, summaryRes, metricsRes] = await Promise.all([
        api.getCurrentDebrief().catch(() => null),
        api.getWeeklySummary().catch(() => null),
        api.getMetrics({ limit: 200 }),
      ]);
      setDebrief(debriefRes);
      setSummary(summaryRes);
      setMetrics(metricsRes.items);
    } catch {
      // Error state handled by empty data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const newDebrief = await api.triggerDebrief();
      setDebrief(newDebrief);
    } catch {
      // Silently handle
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const compositeScores = summary?.composite_scores;
  const highlights = debrief?.highlights;
  const hasData = metrics.length > 0;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.logoCircle,
                { backgroundColor: colors.primary + "20" },
              ]}
            >
              <Heart size={18} color={colors.primary} />
            </View>
            <View>
              <Text style={[styles.greeting, { color: colors.text }]}>
                Hi, {user?.name?.split(" ")[0] || "there"}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Your health at a glance
              </Text>
            </View>
          </View>
        </View>

        {!hasData ? (
          /* Empty state */
          <Card>
            <CardContent style={styles.emptyState}>
              <Sparkles size={32} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No data yet
              </Text>
              <Text
                style={[
                  styles.emptyDescription,
                  { color: colors.textSecondary },
                ]}
              >
                Connect a data source or generate a debrief with sample data to
                get started.
              </Text>
              <Button
                title={generating ? "Generating..." : "Generate Debrief"}
                onPress={handleGenerate}
                loading={generating}
                disabled={generating}
              />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Composite Scores */}
            {compositeScores && (
              <View style={styles.scoresRow}>
                {(
                  [
                    { key: "recovery", label: "Recovery" },
                    { key: "sleep", label: "Sleep" },
                    { key: "activity", label: "Activity" },
                  ] as const
                ).map(({ key, label }) => {
                  const score = compositeScores[key];
                  return (
                    <View
                      key={key}
                      style={[
                        styles.scoreCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scoreLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {label}
                      </Text>
                      <Text style={[styles.scoreValue, { color: colors.text }]}>
                        {score !== null ? Math.round(score) : "—"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Highlights */}
            {highlights && highlights.length > 0 && (
              <HighlightsStrip highlights={highlights} />
            )}

            {/* Debrief */}
            {debrief ? (
              <DebriefCard debrief={debrief} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Weekly Debrief</CardTitle>
                </CardHeader>
                <CardContent>
                  <Text
                    style={[
                      styles.noDebriefText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    No debrief for this week yet.
                  </Text>
                  <Button
                    title={generating ? "Generating..." : "Generate Now"}
                    onPress={handleGenerate}
                    loading={generating}
                    disabled={generating}
                    variant="outline"
                  />
                </CardContent>
              </Card>
            )}

            {/* Sparkline Charts */}
            <View style={styles.chartsSection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Recent Trends
              </Text>
              <View style={styles.chartsGrid}>
                {METRIC_TYPES.map((type) => (
                  <SparklineChart key={type} metricType={type} data={metrics} />
                ))}
              </View>
            </View>
          </>
        )}

        {/* Disclaimer */}
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
          VitalView provides wellness insights, not medical advice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: {
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  scoresRow: {
    flexDirection: "row",
    gap: 10,
  },
  scoreCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -1,
  },
  noDebriefText: {
    fontSize: 13,
    marginBottom: 12,
  },
  chartsSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  chartsGrid: {
    gap: 10,
  },
  disclaimer: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
  },
});
