"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { Metric } from "@/lib/api";

const METRIC_CONFIG: Record<
  string,
  { label: string; unit: string; color: string; decimals: number }
> = {
  sleep_hours: {
    label: "Sleep",
    unit: "hrs",
    color: "var(--chart-1)",
    decimals: 1,
  },
  hrv: {
    label: "HRV",
    unit: "ms",
    color: "var(--chart-2)",
    decimals: 0,
  },
  resting_hr: {
    label: "Resting HR",
    unit: "bpm",
    color: "var(--chart-4)",
    decimals: 0,
  },
  steps: {
    label: "Steps",
    unit: "",
    color: "var(--chart-3)",
    decimals: 0,
  },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatValue(value: number, decimals: number): string {
  if (decimals === 0) return Math.round(value).toLocaleString();
  return value.toFixed(decimals);
}

export function SparklineChart({
  metricType,
  data,
}: {
  metricType: string;
  data: Metric[];
}) {
  const config = METRIC_CONFIG[metricType] || {
    label: metricType,
    unit: "",
    color: "var(--chart-1)",
    decimals: 1,
  };

  const sorted = [...data]
    .filter((m) => m.metric_type === metricType)
    .sort((a, b) => a.date.localeCompare(b.date));

  const chartData = sorted.map((m) => ({
    date: m.date,
    value: m.value,
    label: formatDate(m.date),
  }));

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground font-medium mb-2">
          {config.label}
        </p>
        <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
          No data yet
        </div>
      </div>
    );
  }

  const latest = chartData[chartData.length - 1];
  const values = chartData.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.15 || 1;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs text-muted-foreground font-medium">
          {config.label}
        </p>
        <p className="text-sm font-semibold">
          {formatValue(latest.value, config.decimals)}
          {config.unit && (
            <span className="text-xs text-muted-foreground ml-0.5">
              {config.unit}
            </span>
          )}
        </p>
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient
                id={`grad-${metricType}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={config.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={config.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis dataKey="label" hide />
            <YAxis
              domain={[min - padding, max + padding]}
              hide
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
                padding: "6px 10px",
              }}
              labelStyle={{ color: "var(--muted-foreground)", fontSize: "11px" }}
              formatter={(value: number | undefined) => [
                `${formatValue(value ?? 0, config.decimals)} ${config.unit}`,
                config.label,
              ]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={config.color}
              strokeWidth={2}
              fill={`url(#grad-${metricType})`}
              dot={false}
              activeDot={{
                r: 4,
                strokeWidth: 2,
                stroke: config.color,
                fill: "var(--card)",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
