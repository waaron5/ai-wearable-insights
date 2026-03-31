/**
 * HealthKit integration — Task 2.1
 *
 * Wraps `react-native-health` with typed helpers for the four metric types
 * VitalView tracks: sleep, HRV, resting HR, and steps.
 *
 * All reads are on-device only — HealthKit data never leaves the phone
 * unless explicitly synced to the backend via healthkit-sync.ts.
 */

import { Platform } from "react-native";
import AppleHealthKit, {
  HealthKitPermissions,
  HealthInputOptions,
  HealthValue,
} from "react-native-health";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalizedMetric {
  date: string; // YYYY-MM-DD
  metric_type: "sleep_hours" | "hrv" | "resting_hr" | "steps";
  value: number;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

const permissions: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.SleepAnalysis,
      AppleHealthKit.Constants.Permissions.HeartRateVariability,
      AppleHealthKit.Constants.Permissions.RestingHeartRate,
      AppleHealthKit.Constants.Permissions.StepCount,
    ],
    write: [], // VitalView is read-only
  },
};

// ---------------------------------------------------------------------------
// Initialization & authorization
// ---------------------------------------------------------------------------

/**
 * Check if HealthKit is available on this device.
 * Returns false on simulators, Android, and devices without HealthKit.
 */
export function isHealthKitAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== "ios") {
      resolve(false);
      return;
    }

    AppleHealthKit.isAvailable((err: any, result: boolean) => {
      if (err) {
        resolve(false);
        return;
      }
      resolve(Boolean(result));
    });
  });
}

/**
 * Request HealthKit authorization for the metric types VitalView reads.
 * Returns true if the user granted at least some permissions.
 *
 * Note: Apple's HealthKit API does not reveal which specific permissions
 * were granted — it only tells us the authorization prompt was shown.
 * We discover actual access when we try to read data.
 */
export function initHealthKit(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== "ios") {
      resolve(false);
      return;
    }

    AppleHealthKit.initHealthKit(permissions, (err: string) => {
      if (err) {
        console.warn("[HealthKit] Authorization failed:", err);
        resolve(false);
        return;
      }
      console.log("[HealthKit] Authorization granted");
      resolve(true);
    });
  });
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toISODate(dateString: string): string {
  const d = new Date(dateString);
  return d.toISOString().split("T")[0];
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Data readers
// ---------------------------------------------------------------------------

/**
 * Read sleep data from HealthKit for the given date range.
 *
 * HealthKit stores sleep as category samples with start/end times.
 * We sum all "asleep" intervals per night, assigning each session
 * to the date it started on (matching VitalView's normalizer spec).
 */
export function readSleep(
  startDate: Date,
  endDate: Date = new Date()
): Promise<NormalizedMetric[]> {
  return new Promise((resolve) => {
    const options: HealthInputOptions = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    AppleHealthKit.getSleepSamples(options, (err: any, results: any[]) => {
      if (err || !results) {
        console.warn("[HealthKit] Sleep read error:", err);
        resolve([]);
        return;
      }

      // Group by date, sum asleep intervals, convert to hours
      const byDate = new Map<string, number>();

      for (const sample of results) {
        // Only count actual sleep (not "in bed")
        if (sample.value === "ASLEEP" || sample.value === "INBED") {
          const start = new Date(sample.startDate);
          const end = new Date(sample.endDate);
          const dateKey = toISODate(sample.startDate);
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

          byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + hours);
        }
      }

      const metrics: NormalizedMetric[] = [];
      for (const [date, hours] of byDate) {
        metrics.push({
          date,
          metric_type: "sleep_hours",
          value: Math.round(hours * 100) / 100, // 2 decimal places
        });
      }

      resolve(metrics);
    });
  });
}

/**
 * Read HRV (Heart Rate Variability) data from HealthKit.
 *
 * HealthKit reports SDNN in milliseconds. We take the daily average.
 */
export function readHRV(
  startDate: Date,
  endDate: Date = new Date()
): Promise<NormalizedMetric[]> {
  return new Promise((resolve) => {
    const options: HealthInputOptions = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    AppleHealthKit.getHeartRateVariabilitySamples(
      options,
      (err: any, results: HealthValue[]) => {
        if (err || !results) {
          console.warn("[HealthKit] HRV read error:", err);
          resolve([]);
          return;
        }

        // Group by date and average
        const byDate = new Map<string, number[]>();

        for (const sample of results) {
          const dateKey = toISODate(sample.startDate);
          const existing = byDate.get(dateKey) ?? [];
          existing.push(sample.value);
          byDate.set(dateKey, existing);
        }

        const metrics: NormalizedMetric[] = [];
        for (const [date, values] of byDate) {
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          metrics.push({
            date,
            metric_type: "hrv",
            value: Math.round(avg * 10) / 10, // 1 decimal place
          });
        }

        resolve(metrics);
      }
    );
  });
}

/**
 * Read resting heart rate from HealthKit.
 *
 * We take the lowest reading per day (consistent with the original normalizer spec).
 */
export function readRestingHeartRate(
  startDate: Date,
  endDate: Date = new Date()
): Promise<NormalizedMetric[]> {
  return new Promise((resolve) => {
    const options: HealthInputOptions = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    AppleHealthKit.getRestingHeartRateSamples(
      options,
      (err: any, results: HealthValue[]) => {
        if (err || !results) {
          console.warn("[HealthKit] Resting HR read error:", err);
          resolve([]);
          return;
        }

        // Group by date, take the lowest reading
        const byDate = new Map<string, number>();

        for (const sample of results) {
          const dateKey = toISODate(sample.startDate);
          const current = byDate.get(dateKey);
          if (current === undefined || sample.value < current) {
            byDate.set(dateKey, sample.value);
          }
        }

        const metrics: NormalizedMetric[] = [];
        for (const [date, value] of byDate) {
          metrics.push({
            date,
            metric_type: "resting_hr",
            value: Math.round(value),
          });
        }

        resolve(metrics);
      }
    );
  });
}

/**
 * Read step count from HealthKit.
 *
 * Sums all step samples per day.
 */
export function readSteps(
  startDate: Date,
  endDate: Date = new Date()
): Promise<NormalizedMetric[]> {
  return new Promise((resolve) => {
    const options: HealthInputOptions = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    AppleHealthKit.getDailyStepCountSamples(
      options,
      (err: any, results: any[]) => {
        if (err || !results) {
          console.warn("[HealthKit] Steps read error:", err);
          resolve([]);
          return;
        }

        const metrics: NormalizedMetric[] = [];
        for (const sample of results) {
          metrics.push({
            date: toISODate(sample.startDate),
            metric_type: "steps",
            value: Math.round(sample.value),
          });
        }

        resolve(metrics);
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Combined reader
// ---------------------------------------------------------------------------

/**
 * Read ALL metric types from HealthKit for the given date range.
 * Returns a flat array of normalized metrics ready to POST to the backend.
 */
export async function readAllMetrics(
  startDate: Date,
  endDate: Date = new Date()
): Promise<NormalizedMetric[]> {
  const [sleep, hrv, restingHR, steps] = await Promise.all([
    readSleep(startDate, endDate),
    readHRV(startDate, endDate),
    readRestingHeartRate(startDate, endDate),
    readSteps(startDate, endDate),
  ]);

  return [...sleep, ...hrv, ...restingHR, ...steps];
}
