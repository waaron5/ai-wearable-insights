/**
 * History screen — paginated debrief list with expandable cards.
 *
 * Ported from frontend/app/(app)/history/_history-client.tsx
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FileText, ChevronDown, ChevronUp } from "lucide-react-native";
import { useThemeColors } from "../../../hooks/useThemeColors";
import { api } from "../../../services/api";
import type { Debrief } from "../../../services/api";
import { Badge } from "../../../components/ui/badge";
import { HighlightsStrip } from "../../../components/highlights-strip";
import { FeedbackWidget } from "../../../components/feedback-widget";
import { Separator } from "../../../components/ui/separator";
import { Button } from "../../../components/ui/button";

const PAGE_SIZE = 10;

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

export default function HistoryScreen() {
  const colors = useThemeColors();
  const [debriefs, setDebriefs] = useState<Debrief[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadDebriefs = useCallback(
    async (offset = 0, append = false) => {
      try {
        const res = await api.getDebriefs({ limit: PAGE_SIZE, offset });
        if (append) {
          setDebriefs((prev) => [...prev, ...res.items]);
        } else {
          setDebriefs(res.items);
        }
        setTotal(res.total);
      } catch {
        // Handle silently
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    loadDebriefs();
  }, [loadDebriefs]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDebriefs(0, false);
  }, [loadDebriefs]);

  const loadMore = useCallback(() => {
    if (loadingMore || debriefs.length >= total) return;
    setLoadingMore(true);
    loadDebriefs(debriefs.length, true);
  }, [debriefs.length, total, loadingMore, loadDebriefs]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* Header */}
      <View style={styles.headerContainer}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Debrief History
        </Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {total} debrief{total !== 1 ? "s" : ""}
        </Text>
      </View>

      <FlatList
        data={debriefs}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => {
          const weekRange = formatWeekRange(item.week_start, item.week_end);
          const status = statusLabel(item.status);
          const isExpanded = expandedId === item.id;
          const hasNarrative =
            item.narrative &&
            (item.status === "generated" || item.status === "sent");

          return (
            <TouchableOpacity
              onPress={() => toggleExpand(item.id)}
              activeOpacity={0.7}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              {/* Card header row */}
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: colors.primary + "20" },
                    ]}
                  >
                    <FileText size={14} color={colors.primary} />
                  </View>
                  <View style={styles.cardTextWrap}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      {weekRange}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardHeaderRight}>
                  <Badge variant={status.variant}>{status.text}</Badge>
                  {isExpanded ? (
                    <ChevronUp size={16} color={colors.textMuted} />
                  ) : (
                    <ChevronDown size={16} color={colors.textMuted} />
                  )}
                </View>
              </View>

              {/* Highlights (always shown for ready debriefs) */}
              {item.highlights && item.highlights.length > 0 && (
                <View style={styles.highlightsContainer}>
                  <HighlightsStrip highlights={item.highlights} />
                </View>
              )}

              {/* Expanded narrative */}
              {isExpanded && hasNarrative && (
                <View style={styles.expandedContent}>
                  <Separator />
                  {item.narrative!.split("\n\n").map((p, i) => (
                    <Text
                      key={i}
                      style={[styles.paragraph, { color: colors.text + "E6" }]}
                    >
                      {p}
                    </Text>
                  ))}
                  <Separator />
                  <Text
                    style={[styles.disclaimer, { color: colors.textMuted }]}
                  >
                    {item.disclaimer}
                  </Text>
                  <Separator />
                  <FeedbackWidget debriefId={item.id} />
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FileText size={32} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No debriefs yet
            </Text>
            <Text
              style={[styles.emptySubtitle, { color: colors.textSecondary }]}
            >
              Your weekly debriefs will appear here once generated.
            </Text>
          </View>
        }
        ListFooterComponent={
          debriefs.length < total ? (
            <View style={styles.footerContainer}>
              <Button
                title={loadingMore ? "Loading..." : "Load More"}
                onPress={loadMore}
                variant="outline"
                loading={loadingMore}
              />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  highlightsContainer: {
    marginTop: 2,
  },
  expandedContent: {
    gap: 12,
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
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  footerContainer: {
    paddingTop: 12,
    alignItems: "center",
  },
});
