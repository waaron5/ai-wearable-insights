/**
 * Settings screen — user preferences, consent, data sources, baselines.
 *
 * Ported from frontend/app/(app)/settings/_settings-client.tsx
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Globe,
  Bell,
  Shield,
  Wifi,
  BarChart3,
  LogOut,
  Moon,
  Heart,
  Activity,
  Footprints,
  Clock,
} from "lucide-react-native";
import { useThemeColors } from "../../../hooks/useThemeColors";
import { useAuth } from "../../../components/auth-provider";
import { api } from "../../../services/api";
import type { DataSource, Baseline } from "../../../services/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../../components/ui/card";
import { SwitchRow } from "../../../components/ui/switch-row";
import { Separator } from "../../../components/ui/separator";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { useHealthKit } from "../../../hooks/useHealthKit";

// ---------------------------------------------------------------------------
// Timezone list
// ---------------------------------------------------------------------------

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
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

// ---------------------------------------------------------------------------
// Baseline config
// ---------------------------------------------------------------------------

const BASELINE_CONFIG: Record<
  string,
  { label: string; unit: string; decimals: number; icon: typeof Heart }
> = {
  sleep_hours: { label: "Sleep", unit: "hrs", decimals: 1, icon: Moon },
  hrv: { label: "HRV", unit: "ms", decimals: 0, icon: Heart },
  resting_hr: { label: "Resting HR", unit: "bpm", decimals: 0, icon: Activity },
  steps: { label: "Steps", unit: "steps", decimals: 0, icon: Footprints },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const colors = useThemeColors();
  const { user, logout, refreshUser } = useAuth();
  const healthKit = useHealthKit();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Settings state
  const [timezone, setTimezone] = useState(user?.timezone || "America/New_York");
  const [emailNotifications, setEmailNotifications] = useState(
    user?.email_notifications_enabled || false
  );
  const [dataConsent, setDataConsent] = useState(
    user?.data_sharing_consent || false
  );
  const [sources, setSources] = useState<DataSource[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [saving, setSaving] = useState(false);
  const [showTimezoneList, setShowTimezoneList] = useState(false);

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      const [sourcesRes, baselinesRes] = await Promise.all([
        api.getSources().catch(() => []),
        api.getBaselines().catch(() => []),
      ]);
      setSources(sourcesRes);
      setBaselines(baselinesRes);
    } catch {
      // Handle silently
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (user) {
      setTimezone(user.timezone);
      setEmailNotifications(user.email_notifications_enabled);
      setDataConsent(user.data_sharing_consent);
    }
  }, [user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
    refreshUser();
  }, [loadData, refreshUser]);

  // ---------------------------------------------------------------------------
  // Save handlers
  // ---------------------------------------------------------------------------

  const handleTimezoneChange = async (tz: string) => {
    setTimezone(tz);
    setShowTimezoneList(false);
    setSaving(true);
    try {
      await api.updateMe({ timezone: tz });
      await refreshUser();
    } catch {
      Alert.alert("Error", "Failed to update timezone.");
      setTimezone(user?.timezone || "America/New_York");
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationsToggle = async (value: boolean) => {
    setEmailNotifications(value);
    setSaving(true);
    try {
      await api.updateMe({ email_notifications_enabled: value });
      await refreshUser();
    } catch {
      setEmailNotifications(!value);
    } finally {
      setSaving(false);
    }
  };

  const handleConsentToggle = async (value: boolean) => {
    setDataConsent(value);
    setSaving(true);
    try {
      await api.updateConsent({ data_sharing_consent: value });
      await refreshUser();
    } catch {
      setDataConsent(!value);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: logout,
      },
    ]);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
        <View style={styles.headerContainer}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Settings
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Manage your preferences and data
          </Text>
        </View>

        {/* Timezone */}
        <Card>
          <CardHeader>
            <View style={styles.cardHeaderRow}>
              <Globe size={16} color={colors.textSecondary} />
              <CardTitle size="sm">Timezone</CardTitle>
            </View>
            <CardDescription>
              Used to schedule your weekly debriefs at the right time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TouchableOpacity
              onPress={() => setShowTimezoneList(!showTimezoneList)}
              style={[
                styles.timezoneButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.timezoneText, { color: colors.text }]}>
                {formatTimezone(timezone)}
              </Text>
            </TouchableOpacity>
            {showTimezoneList && (
              <View
                style={[
                  styles.timezoneList,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {TIMEZONES.map((tz) => (
                  <TouchableOpacity
                    key={tz}
                    onPress={() => handleTimezoneChange(tz)}
                    style={[
                      styles.timezoneItem,
                      tz === timezone && {
                        backgroundColor: colors.primary + "15",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.timezoneItemText,
                        {
                          color:
                            tz === timezone ? colors.primary : colors.text,
                          fontWeight: tz === timezone ? "600" : "400",
                        },
                      ]}
                    >
                      {formatTimezone(tz)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <View style={styles.cardHeaderRow}>
              <Bell size={16} color={colors.textSecondary} />
              <CardTitle size="sm">Notifications</CardTitle>
            </View>
          </CardHeader>
          <CardContent>
            <SwitchRow
              label="Email notifications"
              description="Receive weekly debrief summaries via email"
              value={emailNotifications}
              onValueChange={handleNotificationsToggle}
              disabled={saving}
            />
          </CardContent>
        </Card>

        {/* Data Sharing */}
        <Card>
          <CardHeader>
            <View style={styles.cardHeaderRow}>
              <Shield size={16} color={colors.textSecondary} />
              <CardTitle size="sm">Data Sharing</CardTitle>
            </View>
            <CardDescription>
              Contribute anonymized data to improve health insights for
              everyone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SwitchRow
              label="Share anonymized data"
              description="Only statistical summaries — no personal info"
              value={dataConsent}
              onValueChange={handleConsentToggle}
              disabled={saving}
            />
          </CardContent>
        </Card>

        {/* Connected Sources */}
        <Card>
          <CardHeader>
            <View style={styles.cardHeaderRow}>
              <Wifi size={16} color={colors.textSecondary} />
              <CardTitle size="sm">Connected Sources</CardTitle>
            </View>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : sources.length === 0 ? (
              <Text style={[styles.noDataText, { color: colors.textMuted }]}>
                No data sources connected yet.
              </Text>
            ) : (
              <View style={styles.sourcesList}>
                {sources.map((src) => (
                  <View
                    key={src.id}
                    style={[
                      styles.sourceRow,
                      { borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.sourceInfo}>
                      <Text style={[styles.sourceType, { color: colors.text }]}>
                        {src.source_type.replace(/_/g, " ")}
                      </Text>
                      {src.last_synced_at && (
                        <Text
                          style={[
                            styles.sourceSync,
                            { color: colors.textMuted },
                          ]}
                        >
                          Last synced:{" "}
                          {new Date(src.last_synced_at).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                    <Badge variant={src.is_active ? "default" : "secondary"}>
                      {src.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </View>
                ))}
              </View>
            )}

            {/* HealthKit sync button */}
            {healthKit.available && healthKit.authorized && (
              <View style={styles.syncContainer}>
                <Separator />
                <Button
                  title={
                    healthKit.syncing
                      ? "Syncing..."
                      : "Sync HealthKit Now"
                  }
                  onPress={healthKit.sync}
                  variant="outline"
                  loading={healthKit.syncing}
                  disabled={healthKit.syncing}
                />
                {healthKit.lastSyncDate && (
                  <Text
                    style={[styles.lastSyncText, { color: colors.textMuted }]}
                  >
                    Last sync:{" "}
                    {healthKit.lastSyncDate.toLocaleString()}
                  </Text>
                )}
              </View>
            )}
          </CardContent>
        </Card>

        {/* Baselines */}
        <Card>
          <CardHeader>
            <View style={styles.cardHeaderRow}>
              <BarChart3 size={16} color={colors.textSecondary} />
              <CardTitle size="sm">Your Baselines</CardTitle>
            </View>
            <CardDescription>
              Calculated from your historical data. Used to detect
              significant changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : baselines.length === 0 ? (
              <Text style={[styles.noDataText, { color: colors.textMuted }]}>
                Baselines haven't been calculated yet. They'll appear after
                enough data has been collected.
              </Text>
            ) : (
              <View style={styles.baselinesGrid}>
                {baselines.map((bl) => {
                  const cfg = BASELINE_CONFIG[bl.metric_type] || {
                    label: bl.metric_type,
                    unit: "",
                    decimals: 1,
                    icon: BarChart3,
                  };
                  const Icon = cfg.icon;
                  return (
                    <View
                      key={bl.id}
                      style={[
                        styles.baselineCard,
                        { borderColor: colors.border },
                      ]}
                    >
                      <View style={styles.baselineHeader}>
                        <Icon size={12} color={colors.textSecondary} />
                        <Text
                          style={[
                            styles.baselineLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {cfg.label}
                        </Text>
                      </View>
                      <Text
                        style={[styles.baselineValue, { color: colors.text }]}
                      >
                        {bl.baseline_value.toFixed(cfg.decimals)}{" "}
                        <Text
                          style={[
                            styles.baselineUnit,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {cfg.unit}
                        </Text>
                      </Text>
                      <Text
                        style={[
                          styles.baselineStd,
                          { color: colors.textMuted },
                        ]}
                      >
                        \u00B1 {bl.std_deviation.toFixed(cfg.decimals)} std dev
                      </Text>
                      <Text
                        style={[
                          styles.baselineDate,
                          { color: colors.textMuted },
                        ]}
                      >
                        Calculated{" "}
                        {new Date(bl.calculated_at).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" }
                        )}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle size="sm">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <View style={styles.accountRow}>
              <Text style={[styles.accountLabel, { color: colors.textSecondary }]}>
                Email
              </Text>
              <Text
                style={[styles.accountValue, { color: colors.text }]}
                numberOfLines={1}
              >
                {user?.email}
              </Text>
            </View>
            <Separator />
            <View style={styles.accountRow}>
              <Text style={[styles.accountLabel, { color: colors.textSecondary }]}>
                Name
              </Text>
              <Text
                style={[styles.accountValue, { color: colors.text }]}
                numberOfLines={1}
              >
                {user?.name}
              </Text>
            </View>
            <Separator />
            <View style={styles.accountRow}>
              <Text style={[styles.accountLabel, { color: colors.textSecondary }]}>
                Member since
              </Text>
              <Text style={[styles.accountValue, { color: colors.text }]}>
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </Text>
            </View>
          </CardContent>
        </Card>

        {/* Sign Out */}
        <Button
          title="Sign Out"
          onPress={handleLogout}
          variant="destructive"
          icon={<LogOut size={16} color="#fff" style={{ marginRight: 8 }} />}
        />

        <Text style={[styles.version, { color: colors.textMuted }]}>
          VitalView v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  headerContainer: {
    gap: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 13,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timezoneButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  timezoneText: {
    fontSize: 14,
  },
  timezoneList: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    maxHeight: 240,
    overflow: "hidden",
  },
  timezoneItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  timezoneItemText: {
    fontSize: 14,
  },
  noDataText: {
    fontSize: 13,
    lineHeight: 18,
  },
  sourcesList: {
    gap: 8,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  sourceInfo: {
    flex: 1,
    gap: 2,
  },
  sourceType: {
    fontSize: 14,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  sourceSync: {
    fontSize: 11,
  },
  syncContainer: {
    gap: 10,
    marginTop: 8,
  },
  lastSyncText: {
    fontSize: 11,
    textAlign: "center",
  },
  baselinesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  baselineCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 2,
    flexBasis: "47%",
    flexGrow: 1,
  },
  baselineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  baselineLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  baselineValue: {
    fontSize: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  baselineUnit: {
    fontSize: 11,
    fontWeight: "400",
  },
  baselineStd: {
    fontSize: 11,
  },
  baselineDate: {
    fontSize: 10,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
  },
  accountLabel: {
    fontSize: 14,
  },
  accountValue: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "right",
    flex: 1,
  },
  version: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
  },
});
