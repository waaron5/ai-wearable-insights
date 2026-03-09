/**
 * Auth service — secure token storage and session management.
 *
 * Uses expo-secure-store for access/refresh tokens (encrypted keychain).
 * Provides login, signup, token refresh, Apple Sign-In, and logout.
 */

import * as SecureStore from "expo-secure-store";
import { API_URL } from "../constants/config";

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const TOKEN_KEYS = {
  ACCESS: "access_token",
  REFRESH: "refresh_token",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  onboarded_at: string | null;
  data_sharing_consent: boolean;
  email_notifications_enabled: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEYS.ACCESS);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEYS.REFRESH);
}

async function storeTokens(tokens: AuthTokens): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEYS.ACCESS, tokens.access_token);
  await SecureStore.setItemAsync(TOKEN_KEYS.REFRESH, tokens.refresh_token);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEYS.ACCESS);
  await SecureStore.deleteItemAsync(TOKEN_KEYS.REFRESH);
}

// ---------------------------------------------------------------------------
// Auth API calls
// ---------------------------------------------------------------------------

export async function login(
  email: string,
  password: string
): Promise<AuthTokens> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Invalid email or password");
  }

  const tokens: AuthTokens = await res.json();
  await storeTokens(tokens);
  return tokens;
}

export async function signup(
  name: string,
  email: string,
  password: string
): Promise<AuthTokens> {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Signup failed");
  }

  const tokens: AuthTokens = await res.json();
  await storeTokens(tokens);
  return tokens;
}

export async function appleSignIn(
  identityToken: string,
  fullName?: { givenName?: string; familyName?: string }
): Promise<AuthTokens> {
  const nameParts = [fullName?.givenName, fullName?.familyName]
    .filter(Boolean)
    .join(" ");

  const res = await fetch(`${API_URL}/auth/apple`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identity_token: identityToken,
      name: nameParts || undefined,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Apple Sign-In failed");
  }

  const tokens: AuthTokens = await res.json();
  await storeTokens(tokens);
  return tokens;
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      // Refresh token is expired/invalid — force logout
      await clearTokens();
      return null;
    }

    const tokens: AuthTokens = await res.json();
    await storeTokens(tokens);
    return tokens.access_token;
  } catch {
    return null;
  }
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      // Try refreshing
      const newToken = await refreshAccessToken();
      if (!newToken) return null;

      const retryRes = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${newToken}` },
      });

      if (!retryRes.ok) return null;
      return retryRes.json();
    }

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await clearTokens();
}
