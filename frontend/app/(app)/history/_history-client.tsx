"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, Debrief } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Minus,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedbackWidget } from "@/components/feedback-widget";

// ─── Helpers ──────────────────────────────────────────────────────

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(weekEnd + "T00:00:00");
  const startStr = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endStr = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

function statusLabel(
  status: string
): { text: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  switch (status) {
    case "generated":
    case "sent":
      return { text: "Ready", variant: "default" };
    case "generating":
      return { text: "Generating…", variant: "secondary" };
    case "pending":
      return { text: "Pending", variant: "outline" };
    case "failed":
      return { text: "Failed", variant: "destructive" };
    default:
      return { text: status, variant: "outline" };
  }
}

function parseDelta(delta: string): {
  direction: "up" | "down" | "flat";
  value: string;
} {
  const cleaned = delta.replace(/\s/g, "");
  if (cleaned.startsWith("+") || cleaned.startsWith("↑")) {
    return { direction: "up", value: cleaned };
  }
  if (cleaned.startsWith("-") || cleaned.startsWith("↓")) {
    return { direction: "down", value: cleaned };
  }
  return { direction: "flat", value: cleaned };
}

// ─── Expandable Debrief Card ─────────────────────────────────────

function HistoryCard({ debrief }: { debrief: Debrief }) {
  const [expanded, setExpanded] = useState(false);
  const weekRange = formatWeekRange(debrief.week_start, debrief.week_end);
  const status = statusLabel(debrief.status);
  const hasNarrative =
    debrief.narrative &&
    (debrief.status === "generated" || debrief.status === "sent");
  const highlights = debrief.highlights ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{weekRange}</CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant={status.variant} className="text-[11px]">
                  {status.text}
                </Badge>
                {debrief.email_sent_at && (
                  <span className="text-[11px] text-muted-foreground">
                    Emailed{" "}
                    {new Date(debrief.email_sent_at).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" }
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {hasNarrative && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1 text-xs"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? (
                <>
                  Collapse <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Read <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Highlights strip */}
        {highlights.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {highlights.map((h) => {
              const delta = parseDelta(h.delta_vs_baseline);
              return (
                <div
                  key={h.label}
                  className="rounded-lg border bg-muted/40 px-3 py-2"
                >
                  <p className="text-[11px] text-muted-foreground truncate">
                    {h.label}
                  </p>
                  <p className="text-sm font-semibold">{h.value}</p>
                  <div
                    className={cn(
                      "flex items-center gap-0.5 text-[11px] font-medium",
                      delta.direction === "up" && "text-emerald-600 dark:text-emerald-400",
                      delta.direction === "down" && "text-red-500 dark:text-red-400",
                      delta.direction === "flat" && "text-muted-foreground"
                    )}
                  >
                    {delta.direction === "up" && (
                      <ArrowUp className="h-3 w-3" />
                    )}
                    {delta.direction === "down" && (
                      <ArrowDown className="h-3 w-3" />
                    )}
                    {delta.direction === "flat" && (
                      <Minus className="h-3 w-3" />
                    )}
                    {delta.value}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Non-ready states */}
        {debrief.status === "generating" && (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Generating…
          </div>
        )}
        {debrief.status === "pending" && (
          <p className="py-3 text-sm text-muted-foreground">
            Scheduled — will be ready soon.
          </p>
        )}
        {debrief.status === "failed" && (
          <p className="py-3 text-sm text-destructive">
            Generation failed. It will be retried automatically.
          </p>
        )}

        {/* Expandable narrative */}
        {hasNarrative && expanded && (
          <>
            <Separator />
            <div className="space-y-2">
              {debrief.narrative!.split("\n\n").map((paragraph, i) => (
                <p
                  key={i}
                  className="text-sm leading-relaxed text-foreground/90"
                >
                  {paragraph}
                </p>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              {debrief.disclaimer}
            </p>
            <Separator />
            <FeedbackWidget debriefId={debrief.id} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────

function HistorySkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-16 rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main History Client ──────────────────────────────────────────

const PAGE_SIZE = 10;

export default function HistoryClient() {
  const [debriefs, setDebriefs] = useState<Debrief[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Load initial page
  useEffect(() => {
    async function load() {
      try {
        const res = await api.getDebriefs({ limit: PAGE_SIZE, offset: 0 });
        setDebriefs(res.items);
        setTotal(res.total);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load more
  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await api.getDebriefs({
        limit: PAGE_SIZE,
        offset: debriefs.length,
      });
      setDebriefs((prev) => [...prev, ...res.items]);
      setTotal(res.total);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [debriefs.length]);

  const hasMore = debriefs.length < total;

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse your past weekly debriefs.
          </p>
        </div>
        <HistorySkeleton />
      </div>
    );
  }

  if (debriefs.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse your past weekly debriefs.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <Calendar className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No debriefs yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Your weekly health debriefs will appear here once generated.
              Check back after your first week of data.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse your past weekly debriefs.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {total} debrief{total !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="space-y-4">
        {debriefs.map((d) => (
          <HistoryCard key={d.id} debrief={d} />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2 pb-4">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="gap-2"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </>
            ) : (
              <>Load more</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
