/**
 * useHealthKit hook — provides HealthKit state and actions to components.
 *
 * Handles:
 * - Authorization state
 * - Sync state (last sync, in-progress)
 * - Manual sync trigger
 * - Availability check
 */

import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

import { initHealthKit, isHealthKitAvailable } from "../services/healthkit";
import {
  syncRegular,
  getLastSyncDate,
  hasCompletedInitialSync,
  SyncResult,
} from "../services/healthkit-sync";

export interface HealthKitState {
  /** Whether HealthKit is available on this device */
  available: boolean;
  /** Whether the user has granted HealthKit permissions */
  authorized: boolean;
  /** Whether a sync is currently in progress */
  syncing: boolean;
  /** Timestamp of last successful sync */
  lastSyncDate: Date | null;
  /** Whether the initial 90-day onboarding sync has been done */
  initialSyncDone: boolean;
  /** Result of the most recent sync attempt */
  lastSyncResult: SyncResult | null;
}

export interface UseHealthKitReturn extends HealthKitState {
  /** Request HealthKit authorization */
  requestAuthorization: () => Promise<boolean>;
  /** Trigger a manual sync (last 7 days) */
  sync: () => Promise<SyncResult>;
}

export function useHealthKit(): UseHealthKitReturn {
  const [state, setState] = useState<HealthKitState>({
    available: false,
    authorized: false,
    syncing: false,
    lastSyncDate: null,
    initialSyncDone: false,
    lastSyncResult: null,
  });

  // Check availability and sync state on mount
  useEffect(() => {
    if (Platform.OS !== "ios") return;

    (async () => {
      const available = await isHealthKitAvailable();
      const lastSync = await getLastSyncDate();
      const initialDone = await hasCompletedInitialSync();

      setState((prev) => ({
        ...prev,
        available,
        lastSyncDate: lastSync,
        initialSyncDone: initialDone,
        // If initial sync was done, assume authorized
        authorized: initialDone,
      }));
    })();
  }, []);

  const requestAuthorization = useCallback(async (): Promise<boolean> => {
    const granted = await initHealthKit();
    setState((prev) => ({ ...prev, authorized: granted }));
    return granted;
  }, []);

  const sync = useCallback(async (): Promise<SyncResult> => {
    setState((prev) => ({ ...prev, syncing: true }));

    try {
      const result = await syncRegular();

      setState((prev) => ({
        ...prev,
        syncing: false,
        lastSyncDate: result.success ? new Date() : prev.lastSyncDate,
        lastSyncResult: result,
      }));

      return result;
    } catch (err) {
      const result: SyncResult = {
        success: false,
        metricsCount: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      };

      setState((prev) => ({
        ...prev,
        syncing: false,
        lastSyncResult: result,
      }));

      return result;
    }
  }, []);

  return {
    ...state,
    requestAuthorization,
    sync,
  };
}
