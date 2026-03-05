"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DebriefHighlight } from "@/lib/api";

function parseDelta(delta: string): { value: number; label: string } {
  const num = parseFloat(delta.replace(/[^-\d.]/g, ""));
  return { value: isNaN(num) ? 0 : num, label: delta };
}

export function HighlightsStrip({
  highlights,
}: {
  highlights: DebriefHighlight[];
}) {
  if (!highlights || highlights.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {highlights.map((h) => {
        const delta = parseDelta(h.delta_vs_baseline);
        const isPositive = delta.value > 0;
        const isNegative = delta.value < 0;
        const isNeutral = delta.value === 0;

        return (
          <div
            key={h.label}
            className="rounded-xl border border-border bg-card p-4 space-y-1"
          >
            <p className="text-xs text-muted-foreground font-medium">
              {h.label}
            </p>
            <p className="text-xl font-bold tracking-tight">{h.value}</p>
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                isPositive && "text-emerald-600 dark:text-emerald-400",
                isNegative && "text-red-500 dark:text-red-400",
                isNeutral && "text-muted-foreground"
              )}
            >
              {isPositive && <TrendingUp className="h-3 w-3" />}
              {isNegative && <TrendingDown className="h-3 w-3" />}
              {isNeutral && <Minus className="h-3 w-3" />}
              <span>{delta.label} vs baseline</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
