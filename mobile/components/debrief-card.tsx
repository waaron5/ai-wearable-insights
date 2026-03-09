/**
 * DebriefCard — displays a weekly debrief narrative.
 * Ported from frontend/components/debrief-card.tsx.
 */

import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { FileText } from "lucide-react-native";
import { useThemeColors } from "../hooks/useThemeColors";
import {
  Card,
  CardHeader,
  CardContent,
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { FeedbackWidget } from "./feedback-widget";
import type { Debrief } from "../services/api";

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(weekEnd + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = start.toLocaleDateString("en-US", opts);
  const endStr = end.toLocaleDateString("en-US", {
    ...opts,
    year: "numeric",
  });
  return `${startStr} \u2013 ${endStr}`;
}

function statusLabel(
  status: string
): { text: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  switch (status) {
    case "generated":
    case "sent":
      return { text: "Ready", variant: "default" };
    case "generating":
      return { text: "Generating...", variant: "secondary" };
    case "pending":
      return { text: "Pending", variant: "outline" };
    case "failed":
      return { text: "Failed", variant: "destructive" };
    default:
      return { text: status, variant: "outline" };
  }
}

export function DebriefCard({ debrief }: { debrief: Debrief }) {
  const colors = useThemeColors();
  const weekRange = formatWeekRange(debrief.week_start, debrief.week_end);
  const status = statusLabel(debrief.status);
  const hasNarrative =
    debrief.narrative &&
    (debrief.status === "generated" || debrief.status === "sent");

  return (
    <Card>
      <CardHeader>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: colors.primary + "20" },
              ]}
            >
              <FileText size={16} color={colors.primary} />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={[styles.title, { color: colors.text }]}>
                Weekly Debrief
              </Text>
              <Text
                style={[styles.weekRange, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {weekRange}
              </Text>
            </View>
          </View>
          <Badge variant={status.variant}>{status.text}</Badge>
        </View>
      </CardHeader>

      <CardContent>
        {hasNarrative ? (
          <View style={styles.narrativeContainer}>
            {debrief.narrative!.split("\n\n").map((paragraph, i) => (
              <Text
                key={i}
                style={[
                  styles.paragraph,
                  { color: colors.text + "E6" },
                ]}
              >
                {paragraph}
              </Text>
            ))}

            <Separator />

            <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
              {debrief.disclaimer}
            </Text>

            <Separator />

            <FeedbackWidget debriefId={debrief.id} />
          </View>
        ) : debrief.status === "generating" ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              Your debrief is being generated...
            </Text>
          </View>
        ) : debrief.status === "pending" ? (
          <View style={styles.centered}>
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              Your debrief is scheduled and will be ready soon.
            </Text>
          </View>
        ) : debrief.status === "failed" ? (
          <View style={styles.centered}>
            <Text style={[styles.statusText, { color: colors.error }]}>
              Something went wrong generating your debrief. It will be retried
              automatically.
            </Text>
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  weekRange: {
    fontSize: 13,
  },
  narrativeContainer: {
    gap: 14,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
  },
  disclaimer: {
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 12,
  },
  statusText: {
    fontSize: 13,
    textAlign: "center",
  },
});
