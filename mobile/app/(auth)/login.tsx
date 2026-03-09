/**
 * Login screen — email/password + Apple Sign-In.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Heart } from "lucide-react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "../../components/auth-provider";
import { useThemeColors } from "../../hooks/useThemeColors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";

export default function LoginScreen() {
  const colors = useThemeColors();
  const { login, appleSignIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      setError(err?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    setError("");
    setAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error("No identity token received from Apple.");
      }
      await appleSignIn(credential.identityToken, {
        givenName: credential.fullName?.givenName ?? undefined,
        familyName: credential.fullName?.familyName ?? undefined,
      });
    } catch (err: any) {
      if (err?.code !== "ERR_REQUEST_CANCELED") {
        setError(err?.message || "Apple Sign-In failed.");
      }
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Branding */}
          <View style={styles.branding}>
            <View style={[styles.brandIcon, { backgroundColor: colors.primary + "20" }]}>
              <Heart size={28} color={colors.primary} />
            </View>
            <Text style={[styles.brandTitle, { color: colors.text }]}>VitalView</Text>
            <Text style={[styles.brandSub, { color: colors.textSecondary }]}>
              Your personal health narrative
            </Text>
          </View>

          <Card>
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>Enter your credentials to continue</CardDescription>
            </CardHeader>
            <CardContent>
              {error ? (
                <View style={[styles.errorBanner, { backgroundColor: colors.error + "15" }]}>
                  <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                </View>
              ) : null}

              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
              />
              <Input
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
              />

              <Button
                title="Sign In"
                onPress={handleLogin}
                loading={loading}
                disabled={loading || appleLoading}
                style={styles.mt8}
              />

              <View style={styles.dividerRow}>
                <Separator />
                <Text style={[styles.dividerText, { color: colors.textMuted }]}>OR</Text>
                <Separator />
              </View>

              {Platform.OS === "ios" && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={
                    colors.background === "#FFFFFF"
                      ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  }
                  cornerRadius={12}
                  style={styles.appleBtn}
                  onPress={handleApple}
                />
              )}
            </CardContent>
            <CardFooter style={styles.footer}>
              <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                Don't have an account?{" "}
              </Text>
              <Link href="/(auth)/signup" asChild>
                <Text style={[styles.link, { color: colors.primary }]}>Sign Up</Text>
              </Link>
            </CardFooter>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    padding: 16,
    gap: 24,
    justifyContent: "center",
    flexGrow: 1,
  },
  branding: {
    alignItems: "center",
    gap: 6,
  },
  brandIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  brandSub: {
    fontSize: 14,
  },
  errorBanner: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  errorText: {
    fontSize: 13,
  },
  mt8: {
    marginTop: 8,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 12,
  },
  dividerText: {
    fontSize: 12,
  },
  appleBtn: {
    height: 48,
    width: "100%",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
  },
  footerText: {
    fontSize: 14,
  },
  link: {
    fontSize: 14,
    fontWeight: "600",
  },
});
