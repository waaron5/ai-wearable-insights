"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DebriefCard } from "@/components/debrief-card";
import { HighlightsStrip } from "@/components/highlights-strip";
import { SparklineChart } from "@/components/sparkline-chart";
import {
  Heart,
  Sparkles,
  RefreshCw,
  Loader2,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  type Debrief,
  type Metric,
  type WeeklySummary,
} from "@/lib/api";

const METRIC_TYPES = ["sleep_hours", "hrv", "resting_hr", "steps"] as const;

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function EmptyDashboard({ onTrigger, triggering }: { onTrigger: () => void; triggering: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <div className="text-center max-w-sm">
          <h2 className="text-lg font-semibold">Your first debrief awaits</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            You have demo data loaded. Generate your first AI-powered health
            debrief to see your weekly insights.
          </p>
        </div>
        <Button onClick={onTrigger} disabled={triggering} className="mt-2">
          {triggering ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate My First Debrief
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function CompositeScores({ summary }: { summary: WeeklySummary }) {
  const scores = summary.composite_scores;
  if (!scores.recovery && !scores.sleep && !scores.activity) return null;

  const items = [
    { label: "Recovery", value: scores.recovery, color: "text-emerald-500" },
    { label: "Sleep", value: scores.sleep, color: "text-blue-500" },
    { label: "Activity", value: scores.activity, color: "text-amber-500" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-border bg-card p-3 sm:p-4 text-center"
        >
          <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mb-1">
            {item.label}
          </p>
          <p className={`text-xl sm:text-2xl font-bold ${item.color}`}>
            {item.value != null ? item.value : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">/ 100</p>
        </div>
      ))}
    </div>
  );
}

export default function DashboardClient() {
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [noDebrief, setNoDebrief] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all in parallel
      const [debriefResult, summaryResult, metricsResult] =
        await Promise.allSettled([
          api.getCurrentDebrief(),
          api.getWeeklySummary(),
          api.getMetrics({ limit: 200 }),
        ]);

      if (debriefResult.status === "fulfilled") {
        setDebrief(debriefResult.value);
        setNoDebrief(false);
      } else {
        const err = debriefResult.reason;
        if (err instanceof ApiError && err.status === 404) {
          setNoDebrief(true);
        }
      }

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
      }

      if (metricsResult.status === "fulfilled") {
        setMetrics(metricsResult.value.items);
      }
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const result = await api.triggerDebrief({ send_email: false });
      setDebrief(result);
      setNoDebrief(false);
      // Refresh all data after generation
      await fetchData();
    } catch {
      toast.error("Failed to generate debrief. Please try again.");
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Your weekly health insights at a glance.
          </p>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Heart className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your weekly health insights at a glance.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          className="shrink-0"
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Composite Scores */}
      {summary && <CompositeScores summary={summary} />}

      {/* Highlights */}
      {debrief?.highlights && (
        <HighlightsStrip highlights={debrief.highlights} />
      )}

      {/* Debrief Card or Empty State */}
      {noDebrief ? (
        <EmptyDashboard onTrigger={handleTrigger} triggering={triggering} />
      ) : debrief ? (
        <DebriefCard debrief={debrief} />
      ) : null}

      {/* Sparkline Charts */}
      {metrics.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4" />
            30-Day Trends
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {METRIC_TYPES.map((type) => (
              <SparklineChart key={type} metricType={type} data={metrics} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
