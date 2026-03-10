"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  Baseline,
  DataSource,
  User,
} from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  CheckCircle2,
  Database,
  Globe,
  Heart,
  Loader2,
  Mail,
  Shield,
  Watch,
} from "lucide-react";
import { toast } from "sonner";

// ─── Timezones (shared with onboarding) ───────────────────────────

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
  "America/Indiana/Indianapolis",
  "America/Detroit",
  "America/Kentucky/Louisville",
  "America/Boise",
  "America/Juneau",
  "America/Adak",
  "America/Nome",
  "America/Sitka",
  "America/Yakutat",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function formatTimezone(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(now);
    const offset = parts.find((p) => p.type === "timeZoneName")?.value || "";
    const city = tz.split("/").pop()?.replace(/_/g, " ") || tz;
    return `${city} (${offset})`;
  } catch {
    return tz;
  }
}

// ─── Metric display helpers ───────────────────────────────────────

const METRIC_CONFIG: Record<
  string,
  { label: string; unit: string; icon: typeof Heart; decimals: number }
> = {
  sleep_hours: { label: "Sleep", unit: "hrs", icon: Activity, decimals: 1 },
  hrv: { label: "HRV", unit: "ms", icon: Heart, decimals: 0 },
  resting_hr: { label: "Resting HR", unit: "bpm", icon: Heart, decimals: 0 },
  steps: { label: "Steps", unit: "steps", icon: Activity, decimals: 0 },
};

// ─── Data source display ──────────────────────────────────────────

const SOURCE_LABELS: Record<string, { name: string; icon: typeof Watch }> = {
  manual: { name: "Manual / Demo Data", icon: Database },
  apple_health: { name: "Apple Health", icon: Watch },
  whoop: { name: "Whoop", icon: Watch },
  oura: { name: "Oura Ring", icon: Watch },
};

const COMING_SOON_SOURCES = [
  { key: "apple_health", name: "Apple Health" },
  { key: "whoop", name: "Whoop" },
  { key: "oura", name: "Oura Ring" },
  { key: "garmin", name: "Garmin" },
  { key: "fitbit", name: "Fitbit" },
];

// ─── Settings Client ──────────────────────────────────────────────

export default function SettingsClient() {
  const [user, setUser] = useState<User | null>(null);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Saving states
  const [savingTz, setSavingTz] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);

  // Load all data on mount
  useEffect(() => {
    async function load() {
      try {
        const [me, bl, src] = await Promise.all([
          api.getMe(),
          api.getBaselines().catch(() => [] as Baseline[]),
          api.getSources().catch(() => [] as DataSource[]),
        ]);
        setUser(me);
        setBaselines(bl);
        setSources(src);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Update timezone
  const handleTimezoneChange = useCallback(
    async (tz: string) => {
      if (!user) return;
      setSavingTz(true);
      try {
        const updated = await api.updateMe({ timezone: tz });
        setUser(updated);
        toast.success("Timezone updated");
      } catch {
        toast.error("Failed to update timezone");
      } finally {
        setSavingTz(false);
      }
    },
    [user]
  );

  // Toggle email notifications
  const handleEmailToggle = useCallback(
    async (enabled: boolean) => {
      if (!user) return;
      setSavingEmail(true);
      try {
        const updated = await api.updateMe({
          email_notifications_enabled: enabled,
        });
        setUser(updated);
        toast.success(
          enabled ? "Email notifications enabled" : "Email notifications disabled"
        );
      } catch {
        toast.error("Failed to update notification preference");
      } finally {
        setSavingEmail(false);
      }
    },
    [user]
  );

  // Toggle data sharing consent
  const handleConsentToggle = useCallback(
    async (consent: boolean) => {
      if (!user) return;
      setSavingConsent(true);
      try {
        await api.updateConsent({ data_sharing_consent: consent });
        setUser((prev) =>
          prev
            ? {
                ...prev,
                data_sharing_consent: consent,
                data_sharing_consented_at: consent
                  ? new Date().toISOString()
                  : prev.data_sharing_consented_at,
              }
            : prev
        );
        toast.success(
          consent
            ? "Data sharing enabled — thank you!"
            : "Data sharing disabled"
        );
      } catch {
        toast.error("Failed to update consent");
      } finally {
        setSavingConsent(false);
      }
    },
    [user]
  );

  // Connected source keys for filtering "coming soon"
  const connectedKeys = new Set(sources.map((s) => s.source_type));

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your preferences and account.
          </p>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-60 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your preferences and account.
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Unable to load your settings. Please try refreshing.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your preferences and account.
        </p>
      </div>

      {/* ── Timezone ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Timezone</CardTitle>
          </div>
          <CardDescription>
            Used for scheduling weekly debriefs at the right time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Select
              value={user.timezone}
              onValueChange={handleTimezoneChange}
              disabled={savingTz}
            >
              <SelectTrigger className="w-full max-w-sm">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {formatTimezone(tz)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {savingTz && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>

      {/* ── Email Notifications ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Email Notifications</CardTitle>
          </div>
          <CardDescription>
            Receive your weekly debrief summary via email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label
              htmlFor="email-notif"
              className="text-sm font-normal cursor-pointer"
            >
              Send weekly debrief emails
            </Label>
            <div className="flex items-center gap-2">
              {savingEmail && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <Switch
                id="email-notif"
                checked={user.email_notifications_enabled}
                onCheckedChange={handleEmailToggle}
                disabled={savingEmail}
              />
            </div>
          </div>
          {user.notification_email && (
            <p className="text-xs text-muted-foreground mt-2">
              Sending to: {user.notification_email}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Data Sharing Consent ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Anonymous Data Sharing</CardTitle>
          </div>
          <CardDescription>
            Help improve health insights for everyone by contributing
            anonymized, aggregate data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="data-sharing"
              className="text-sm font-normal cursor-pointer"
            >
              Share anonymized data
            </Label>
            <div className="flex items-center gap-2">
              {savingConsent && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <Switch
                id="data-sharing"
                checked={user.data_sharing_consent}
                onCheckedChange={handleConsentToggle}
                disabled={savingConsent}
              />
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
            <p className="text-xs text-muted-foreground">
              <strong>What&apos;s shared:</strong> Weekly aggregate statistics
              only (averages, min/max). No names, emails, or device IDs.
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>How it&apos;s protected:</strong> Your identity is mapped
              via a one-way cryptographic hash. The anonymized data cannot be
              traced back to you.
            </p>
            <p className="text-xs text-muted-foreground">
              You can disable this at any time. Previously contributed anonymous
              data cannot be retroactively removed (it&apos;s already
              de-identified).
            </p>
          </div>
          {user.data_sharing_consented_at && user.data_sharing_consent && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Consented on{" "}
              {new Date(user.data_sharing_consented_at).toLocaleDateString(
                "en-US",
                { month: "long", day: "numeric", year: "numeric" }
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Connected Sources ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Watch className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Data Sources</CardTitle>
          </div>
          <CardDescription>
            Wearable devices and manual data sources connected to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sources.length > 0 && (
            <div className="space-y-2">
              {sources.map((src) => {
                const cfg = SOURCE_LABELS[src.source_type] || {
                  name: src.source_type,
                  icon: Database,
                };
                const Icon = cfg.icon;
                return (
                  <div
                    key={src.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{cfg.name}</p>
                        {src.last_synced_at && (
                          <p className="text-xs text-muted-foreground">
                            Last synced:{" "}
                            {new Date(src.last_synced_at).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric", year: "numeric" }
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={src.is_active ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {src.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}

          {/* Coming soon integrations */}
          <Separator />
          <p className="text-xs font-medium text-muted-foreground">
            Coming Soon
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {COMING_SOON_SOURCES.filter((s) => !connectedKeys.has(s.key)).map(
              (s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <Watch className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm">{s.name}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    Soon
                  </Badge>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Baselines ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Your Baselines</CardTitle>
          </div>
          <CardDescription>
            30-day rolling averages used to detect meaningful changes in your
            health data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {baselines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Baselines will appear once you have at least 7 days of data.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {baselines.map((bl) => {
                const cfg = METRIC_CONFIG[bl.metric_type] || {
                  label: bl.metric_type,
                  unit: "",
                  icon: Activity,
                  decimals: 1,
                };
                const Icon = cfg.icon;
                return (
                  <div
                    key={bl.id}
                    className="rounded-lg border px-4 py-3 space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground font-medium">
                        {cfg.label}
                      </p>
                    </div>
                    <p className="text-lg font-semibold tabular-nums">
                      {bl.baseline_value.toFixed(cfg.decimals)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {cfg.unit}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      ± {bl.std_deviation.toFixed(cfg.decimals)} std dev
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Calculated{" "}
                      {new Date(bl.calculated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Account Info ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground shrink-0">Email</span>
            <span className="font-medium truncate text-right">{user.email}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground shrink-0">Name</span>
            <span className="font-medium truncate text-right">{user.name}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground shrink-0">Member since</span>
            <span className="font-medium text-right">
              {new Date(user.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
