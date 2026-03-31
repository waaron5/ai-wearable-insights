/**
 * AuthProvider — React Context for authentication state.
 *
 * Wraps the app and provides:
 * - Current user state
 * - Loading state during token verification
 * - Login/signup/logout actions
 * - Auto-refresh of expired tokens
 *
 * Replaces NextAuth's SessionProvider from the web app.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSegments } from "expo-router";
import {
  login as authLogin,
  signup as authSignup,
  appleSignIn as authAppleSignIn,
  logout as authLogout,
  fetchCurrentUser,
  AuthUser,
} from "../services/auth";
import { clearSyncState } from "../services/healthkit-sync";
import { registerForPushNotifications } from "../services/push-notifications";

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface AuthContextValue {
  /** The currently authenticated user, or null */
  user: AuthUser | null;
  /** Whether the auth state is still being determined */
  loading: boolean;
  /** Login with email/password */
  login: (email: string, password: string) => Promise<void>;
  /** Create a new account and auto-login */
  signup: (name: string, email: string, password: string) => Promise<void>;
  /** Sign in with Apple */
  appleSignIn: (
    identityToken: string,
    fullName?: { givenName?: string; familyName?: string }
  ) => Promise<void>;
  /** Clear tokens and reset state */
  logout: () => Promise<void>;
  /** Refetch the current user from the backend */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();
  const maybeRegisterPushNotifications = useCallback(() => {
    if (__DEV__) return;
    registerForPushNotifications().catch(console.warn);
  }, []);

  // ---------------------------------------------------------------------------
  // Bootstrap: check for existing tokens on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const currentUser = await fetchCurrentUser();
        setUser(currentUser);
        // Re-register push token on each app launch for logged-in users
        if (currentUser?.onboarded_at) {
          maybeRegisterPushNotifications();
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [maybeRegisterPushNotifications]);

  // ---------------------------------------------------------------------------
  // Navigation guard: redirect based on auth state
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";

    if (!user && !inAuthGroup) {
      // Not logged in and not on auth page → redirect to login
      router.replace("/(auth)/login");
    } else if (user && !user.onboarded_at && !inOnboarding) {
      // Logged in but not onboarded → redirect to onboarding
      router.replace("/onboarding");
    } else if (user && user.onboarded_at && (inAuthGroup || inOnboarding)) {
      // Logged in and onboarded but on auth/onboarding page → go to app
      router.replace("/(app)/(tabs)");
    }
  }, [user, loading, segments]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const login = useCallback(async (email: string, password: string) => {
    await authLogin(email, password);
    const currentUser = await fetchCurrentUser();
    setUser(currentUser);
    maybeRegisterPushNotifications();
  }, [maybeRegisterPushNotifications]);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      await authSignup(name, email, password);
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      maybeRegisterPushNotifications();
    },
    [maybeRegisterPushNotifications]
  );

  const appleSignIn = useCallback(
    async (
      identityToken: string,
      fullName?: { givenName?: string; familyName?: string }
    ) => {
      await authAppleSignIn(identityToken, fullName);
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      maybeRegisterPushNotifications();
    },
    [maybeRegisterPushNotifications]
  );

  const logout = useCallback(async () => {
    await authLogout();
    await clearSyncState();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const currentUser = await fetchCurrentUser();
    setUser(currentUser);
  }, []);

  // ---------------------------------------------------------------------------
  // Memoized value
  // ---------------------------------------------------------------------------

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, signup, appleSignIn, logout, refreshUser }),
    [user, loading, login, signup, appleSignIn, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
