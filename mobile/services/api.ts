/**
 * Typed API client for the FastAPI backend.
 *
 * Ported from frontend/lib/api.ts — all TypeScript interfaces carried over.
 * Key differences from web version:
 * - Uses absolute URL (API_URL) instead of Next.js /api/ proxy
 * - Adds Bearer token from expo-secure-store
 * - Auto-refreshes expired tokens (401 → refresh → retry)
 */

import { API_URL } from "../constants/config";
import { getAccessToken, refreshAccessToken } from "./auth";

// ─── Response Types ───────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

// Users
export interface User {
  id: string;
  email: string;
  name: string;
  timezone: string;
  notification_email: string | null;
  email_notifications_enabled: boolean;
  onboarded_at: string | null;
  data_sharing_consent: boolean;
  data_sharing_consented_at: string | null;
  created_at: string;
}

export interface UserUpdate {
  timezone?: string;
  notification_email?: string;
  email_notifications_enabled?: boolean;
  onboarded_at?: string;
}

// Metrics
export interface Metric {
  id: string;
  user_id: string;
  source_id: string | null;
  date: string;
  metric_type: "sleep_hours" | "hrv" | "resting_hr" | "steps";
  value: number;
  created_at: string;
}

export interface MetricCreate {
  date: string;
  metric_type: "sleep_hours" | "hrv" | "resting_hr" | "steps";
  value: number;
  source_id?: string;
}

// Baselines
export interface Baseline {
  id: string;
  user_id: string;
  metric_type: string;
  baseline_value: number;
  std_deviation: number;
  calculated_at: string;
}

// Sources
export interface DataSource {
  id: string;
  user_id: string;
  source_type: string;
  config: Record<string, unknown> | null;
  last_synced_at: string | null;
  is_active: boolean;
  created_at: string;
}

// Debriefs
export interface Debrief {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  narrative: string | null;
  highlights: DebriefHighlight[] | null;
  status: "pending" | "generating" | "generated" | "sent" | "failed";
  email_sent_at: string | null;
  created_at: string;
  updated_at: string;
  disclaimer: string;
}

export interface DebriefHighlight {
  label: string;
  value: string;
  delta_vs_baseline: string;
}

export interface WeeklySummary {
  week: string;
  insufficient_data: boolean;
  composite_scores: {
    recovery: number | null;
    sleep: number | null;
    activity: number | null;
  };
  per_metric: PerMetricSummary[];
  notable_days: NotableDay[];
  prior_week_avgs: Record<string, number>;
  disclaimer: string;
}

export interface PerMetricSummary {
  type: string;
  current_avg: number;
  current_min: number;
  current_max: number;
  days_with_data: number;
  baseline: number | null;
  std_deviation: number | null;
  delta_pct_vs_baseline: number | null;
  weekly_z_score: number | null;
  wow_delta_pct: number | null;
  trend: "improving" | "declining" | "stable" | null;
}

export interface NotableDay {
  date: string;
  metric_type: string;
  value: number;
  z_score: number;
  flag: "high" | "low";
}

export interface FeedbackCreate {
  rating: number;
  comment?: string;
}

export interface Feedback {
  id: string;
  debrief_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

// Chat
export interface ChatSession {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatReply {
  answer: string;
  disclaimer: string;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}

export interface EmergencyReply {
  emergency: true;
  message: string;
  hotlines: { name: string; number: string }[];
  disclaimer: string;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}

// Surveys
export interface SurveyQuestion {
  id: string;
  category: string;
  question_text: string;
  response_type: "scale" | "single_choice" | "multi_choice" | "free_text";
  options: { choices?: string[] } | null;
  display_order: number;
}

export interface SurveyAnswer {
  question_id: string;
  response_value: string;
}

export interface SurveyResponse {
  id: string;
  question_id: string;
  response_value: string;
  survey_context: "onboarding" | "periodic_checkin";
  responded_at: string;
}

// ─── API Error ────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// ─── Fetch Wrapper with Auth ──────────────────────────────────────

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}/${path}`;

  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    // Deduplicate concurrent refresh calls
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken();
    }

    const newToken = await refreshPromise;
    isRefreshing = false;
    refreshPromise = null;

    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(url, { ...options, headers });
    } else {
      throw new ApiError(401, "Session expired. Please log in again.");
    }
  }

  if (!res.ok) {
    let data: unknown;
    const raw = await res.text();
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    const message =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as Record<string, unknown>).detail)
        : typeof data === "object" && data !== null && "error" in data
          ? String((data as Record<string, unknown>).error)
          : `API error ${res.status}`;
    throw new ApiError(res.status, message, data);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

// ─── API Methods ──────────────────────────────────────────────────

export const api = {
  // Users
  getMe: () => apiFetch<User>("users/me"),

  updateMe: (data: UserUpdate) =>
    apiFetch<User>("users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Metrics
  getMetrics: (params?: {
    start_date?: string;
    end_date?: string;
    metric_type?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    const qs = query.toString();
    return apiFetch<PaginatedResponse<Metric>>(
      `metrics${qs ? `?${qs}` : ""}`
    );
  },

  createMetrics: (metrics: MetricCreate[]) =>
    apiFetch<Metric[]>("metrics", {
      method: "POST",
      body: JSON.stringify(metrics),
    }),

  // Baselines
  getBaselines: () => apiFetch<Baseline[]>("baselines"),

  // Sources
  getSources: () => apiFetch<DataSource[]>("sources"),

  createSource: (data: {
    source_type: string;
    config?: Record<string, unknown>;
  }) =>
    apiFetch<DataSource>("sources", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Debriefs
  getDebriefs: (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    const qs = query.toString();
    return apiFetch<PaginatedResponse<Debrief>>(
      `debriefs${qs ? `?${qs}` : ""}`
    );
  },

  getCurrentDebrief: () => apiFetch<Debrief>("debriefs/current"),

  getWeeklySummary: () => apiFetch<WeeklySummary>("debriefs/weekly-summary"),

  triggerDebrief: (data?: {
    week_start?: string;
    week_end?: string;
    send_email?: boolean;
  }) =>
    apiFetch<Debrief>("debriefs/trigger", {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  submitFeedback: (debriefId: string, data: FeedbackCreate) =>
    apiFetch<Feedback>(`debriefs/${debriefId}/feedback`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Chat
  getChatSessions: (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    const qs = query.toString();
    return apiFetch<PaginatedResponse<ChatSession>>(
      `chat/sessions${qs ? `?${qs}` : ""}`
    );
  },

  createChatSession: (data?: { title?: string }) =>
    apiFetch<ChatSession>("chat/sessions", {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  getChatMessages: (
    sessionId: string,
    params?: { limit?: number; offset?: number }
  ) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    const qs = query.toString();
    return apiFetch<PaginatedResponse<ChatMessage>>(
      `chat/sessions/${sessionId}/messages${qs ? `?${qs}` : ""}`
    );
  },

  sendMessage: (sessionId: string, content: string) =>
    apiFetch<ChatReply | EmergencyReply>(
      `chat/sessions/${sessionId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      }
    ),

  // Onboarding
  seedDemo: () =>
    apiFetch<DataSource>("onboarding/seed-demo", { method: "POST" }),

  completeOnboarding: () =>
    apiFetch<Record<string, unknown>>("onboarding/complete", {
      method: "POST",
    }),

  // Surveys
  getSurveyQuestions: (params?: { category?: string; context?: string }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    const qs = query.toString();
    return apiFetch<SurveyQuestion[]>(
      `surveys/questions${qs ? `?${qs}` : ""}`
    );
  },

  submitSurveyResponses: (data: {
    answers: SurveyAnswer[];
    survey_context: "onboarding" | "periodic_checkin";
  }) =>
    apiFetch<SurveyResponse[]>("surveys/responses", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getSurveyResponses: (params?: { survey_context?: string }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) query.set(k, String(v));
      });
    }
    const qs = query.toString();
    return apiFetch<SurveyResponse[]>(
      `surveys/responses${qs ? `?${qs}` : ""}`
    );
  },

  updateConsent: (data: { data_sharing_consent: boolean }) =>
    apiFetch<Record<string, unknown>>("surveys/consent", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};
