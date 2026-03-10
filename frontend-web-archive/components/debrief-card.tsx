"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FeedbackWidget } from "@/components/feedback-widget";
import { FileText } from "lucide-react";
import type { Debrief } from "@/lib/api";

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(weekEnd + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  const startStr = start.toLocaleDateString("en-US", opts);
  const endStr = end.toLocaleDateString("en-US", {
    ...opts,
    year: "numeric",
  });
  return `${startStr} – ${endStr}`;
}

function statusLabel(status: string): { text: string; variant: "default" | "secondary" | "destructive" | "outline" } {
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
  const weekRange = formatWeekRange(debrief.week_start, debrief.week_end);
  const status = statusLabel(debrief.status);
  const hasNarrative =
    debrief.narrative &&
    (debrief.status === "generated" || debrief.status === "sent");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">Weekly Debrief</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">{weekRange}</p>
            </div>
          </div>
          <Badge variant={status.variant}>{status.text}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {hasNarrative ? (
          <>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {debrief.narrative!.split("\n\n").map((paragraph, i) => (
                <p
                  key={i}
                  className="text-sm leading-relaxed text-foreground/90"
                >
                  {paragraph}
                </p>
              ))}
            </div>

            <Separator />

            <div>
              <p className="text-xs text-muted-foreground italic">
                {debrief.disclaimer}
              </p>
            </div>

            <Separator />

            <FeedbackWidget debriefId={debrief.id} />
          </>
        ) : debrief.status === "generating" ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Your debrief is being generated...
            </p>
          </div>
        ) : debrief.status === "pending" ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Your debrief is scheduled and will be ready soon.
            </p>
          </div>
        ) : debrief.status === "failed" ? (
          <div className="py-6 text-center">
            <p className="text-sm text-destructive">
              Something went wrong generating your debrief. It will be retried
              automatically.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
