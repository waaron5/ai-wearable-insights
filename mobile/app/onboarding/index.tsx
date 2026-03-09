/**
 * Onboarding wizard — 5-step flow for new users.
 *
 * Steps:
 * 0. Welcome
 * 1. Timezone selection
 * 2. Data sharing consent
 * 3. Health survey (if consented)
 * 4. Demo data + finish
 *
 * Also includes HealthKit authorization prompt.
 *
 * Ported from frontend/app/onboarding/_onboarding-wizard.tsx
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Heart,
  Globe,
  Shield,
  ClipboardList,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react-native";
import { useThemeColors } from "../../hooks/useThemeColors";
import { useAuth } from "../../components/auth-provider";
import { useHealthKit } from "../../hooks/useHealthKit";
import { syncInitial } from "../../services/healthkit-sync";
import { api } from "../../services/api";
import type { SurveyQuestion } from "../../services/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { SwitchRow } from "../../components/ui/switch-row";
import { ProgressBar } from "../../components/ui/progress-bar";
import { Separator } from "../../components/ui/separator";

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

function detectTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TIMEZONES.includes(detected)) return detected;
    return "America/New_York";
  } catch {
    return "America/New_York";
  }
}

const TOTAL_STEPS = 5;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const { refreshUser } = useAuth();
  const healthKit = useHealthKit();

  const [step, setStep] = useState(0);
  const [timezone, setTimezone] = useState(detectTimezone);
  const [showTimezoneList, setShowTimezoneList] = useState(false);
  const [dataConsent, setDataConsent] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>(
    {}
  );
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [surveyLoaded, setSurveyLoaded] = useState(false);
  const [seedDemo, setSeedDemo] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const [healthKitSyncing, setHealthKitSyncing] = useState(false);
  const [healthKitStatus, setHealthKitStatus] = useState("");

  // ---------------------------------------------------------------------------
  // Load survey questions when reaching step 3
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (step === 3 && dataConsent && !surveyLoaded) {
      const loadQuestions = async () => {
        setSurveyLoading(true);
        try {
          const questions = await api.getSurveyQuestions();
          setSurveyQuestions(questions);
        } catch {
          // OK to skip
        } finally {
          setSurveyLoading(false);
          setSurveyLoaded(true);
        }
      };
      loadQuestions();
    }
  }, [step, dataConsent, surveyLoaded]);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  const nextStep = () => {
    if (step === 2 && !dataConsent) {
      setStep(4); // Skip survey
    } else if (step === 3 && surveyQuestions.length === 0) {
      setStep(4); // No survey questions
    } else {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    }
  };

  const prevStep = () => {
    if (step === 4 && !dataConsent) {
      setStep(2);
    } else if (step === 4 && surveyQuestions.length === 0) {
      setStep(2);
    } else {
      setStep((s) => Math.max(s - 1, 0));
    }
  };

  // ---------------------------------------------------------------------------
  // HealthKit authorization + initial sync
  // ---------------------------------------------------------------------------

  const handleHealthKitAuth = async () => {
    const granted = await healthKit.requestAuthorization();
    if (granted) {
      setHealthKitSyncing(true);
      try {
        await syncInitial((message) => setHealthKitStatus(message));
      } catch {
        // Non-blocking
      } finally {
        setHealthKitSyncing(false);
        setHealthKitStatus("");
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Finish
  // ---------------------------------------------------------------------------

  const handleFinish = useCallback(async () => {
    setFinishing(true);
    setError("");

    try {
      // Save timezone
      await api.updateMe({ timezone });

      // Save consent
      if (dataConsent) {
        await api.updateConsent({ data_sharing_consent: true });
      }

      // Save survey answers
      if (dataConsent && Object.keys(surveyAnswers).length > 0) {
        const answers = Object.entries(surveyAnswers).map(
          ([question_id, response_value]) => ({ question_id, response_value })
        );
        await api.submitSurveyResponses({
          answers,
          survey_context: "onboarding",
        });
      }

      // Seed demo data
      if (seedDemo) {
        await api.seedDemo();
      }

      // Mark onboarded
      const onboardedAt = new Date().toISOString();
      await api.updateMe({ onboarded_at: onboardedAt });

      // Refresh user state — AuthProvider will route to app
      await refreshUser();
    } catch (err) {
      console.error("Onboarding error:", err);
      setError("Something went wrong. Please try again.");
      setFinishing(false);
    }
  }, [timezone, dataConsent, surveyAnswers, seedDemo, refreshUser]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressLabels}>
            <Text style={[styles.progressText, { color: colors.textMuted }]}>
              Step {step + 1} of {TOTAL_STEPS}
            </Text>
            <Text style={[styles.progressText, { color: colors.textMuted }]}>
              {Math.round(progress)}%
            </Text>
          </View>
          <ProgressBar value={progress} />
        </View>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <Card>
            <CardHeader style={styles.centeredHeader}>
              <View
                style={[
                  styles.bigIcon,
                  { backgroundColor: colors.primary + "20" },
                ]}
              >
                <Heart size={32} color={colors.primary} />
              </View>
              <CardTitle size="lg">Welcome to VitalView</CardTitle>
              <CardDescription>
                Your personal health narrative. We analyze your wearable data
                and deliver weekly insights.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {[
                {
                  Icon: Sparkles,
                  title: "Weekly AI Debriefs",
                  desc: "A personalized health narrative every week",
                },
                {
                  Icon: ClipboardList,
                  title: "Track Your Trends",
                  desc: "Sleep, HRV, resting heart rate, and activity",
                },
                {
                  Icon: Shield,
                  title: "Private & Secure",
                  desc: "Your data is encrypted and never shared without consent",
                },
              ].map((item) => (
                <View
                  key={item.title}
                  style={[
                    styles.featureRow,
                    { borderColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.featureIcon,
                      { backgroundColor: colors.primary + "20" },
                    ]}
                  >
                    <item.Icon size={16} color={colors.primary} />
                  </View>
                  <View style={styles.featureTextWrap}>
                    <Text style={[styles.featureTitle, { color: colors.text }]}>
                      {item.title}
                    </Text>
                    <Text
                      style={[
                        styles.featureDesc,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {item.desc}
                    </Text>
                  </View>
                </View>
              ))}

              {/* HealthKit authorization */}
              {healthKit.available && !healthKit.authorized && (
                <View style={styles.healthKitSection}>
                  <Separator />
                  <Text
                    style={[styles.hkTitle, { color: colors.text }]}
                  >
                    Connect Apple Health
                  </Text>
                  <Text
                    style={[styles.hkDesc, { color: colors.textSecondary }]}
                  >
                    Allow VitalView to read your sleep, HRV, resting heart rate,
                    and step data.
                  </Text>
                  <Button
                    title={
                      healthKitSyncing
                        ? healthKitStatus || "Syncing..."
                        : "Connect HealthKit"
                    }
                    onPress={handleHealthKitAuth}
                    loading={healthKitSyncing}
                    disabled={healthKitSyncing}
                  />
                </View>
              )}

              {healthKit.authorized && (
                <View style={styles.healthKitSection}>
                  <Separator />
                  <View style={styles.hkDoneRow}>
                    <CheckCircle2 size={16} color={colors.success} />
                    <Text
                      style={[styles.hkDoneText, { color: colors.success }]}
                    >
                      HealthKit connected
                    </Text>
                  </View>
                </View>
              )}
            </CardContent>
            <CardFooter>
              <Button
                title="Get Started"
                onPress={nextStep}
                style={styles.fullWidth}
                icon={
                  <ArrowRight
                    size={16}
                    color={colors.primaryForeground}
                    style={{ marginLeft: 8 }}
                  />
                }
              />
            </CardFooter>
          </Card>
        )}

        {/* Step 1: Timezone */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <View
                style={[
                  styles.stepIcon,
                  { backgroundColor: colors.primary + "20" },
                ]}
              >
                <Globe size={20} color={colors.primary} />
              </View>
              <CardTitle>Your Timezone</CardTitle>
              <CardDescription>
                We use this to schedule your weekly debriefs at the right time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TouchableOpacity
                onPress={() => setShowTimezoneList(!showTimezoneList)}
                style={[
                  styles.tzButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.tzText, { color: colors.text }]}>
                  {formatTimezone(timezone)}
                </Text>
              </TouchableOpacity>
              {showTimezoneList && (
                <ScrollView
                  style={[
                    styles.tzList,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                  nestedScrollEnabled
                >
                  {TIMEZONES.map((tz) => (
                    <TouchableOpacity
                      key={tz}
                      onPress={() => {
                        setTimezone(tz);
                        setShowTimezoneList(false);
                      }}
                      style={[
                        styles.tzItem,
                        tz === timezone && {
                          backgroundColor: colors.primary + "15",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tzItemText,
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
                </ScrollView>
              )}
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Auto-detected from your device. You can change this anytime in
                Settings.
              </Text>
            </CardContent>
            <CardFooter>
              <Button
                title="Back"
                onPress={prevStep}
                variant="outline"
                style={styles.flex}
                icon={
                  <ArrowLeft
                    size={16}
                    color={colors.text}
                    style={{ marginRight: 8 }}
                  />
                }
              />
              <Button
                title="Continue"
                onPress={nextStep}
                style={styles.flex}
                icon={
                  <ArrowRight
                    size={16}
                    color={colors.primaryForeground}
                    style={{ marginLeft: 8 }}
                  />
                }
              />
            </CardFooter>
          </Card>
        )}

        {/* Step 2: Data Sharing Consent */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <View
                style={[
                  styles.stepIcon,
                  { backgroundColor: colors.primary + "20" },
                ]}
              >
                <Shield size={20} color={colors.primary} />
              </View>
              <CardTitle>Help Improve Health Insights</CardTitle>
              <CardDescription>
                Optionally contribute anonymized data to improve insights for
                everyone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <View
                style={[
                  styles.consentCard,
                  { borderColor: colors.border },
                ]}
              >
                <SwitchRow
                  label="Share anonymized health data"
                  value={dataConsent}
                  onValueChange={setDataConsent}
                />
                <Separator />
                <Text
                  style={[styles.consentBody, { color: colors.textSecondary }]}
                >
                  If you opt in, we will:
                </Text>
                <Text
                  style={[styles.consentBullet, { color: colors.textSecondary }]}
                >
                  {"\u2022"} Strip all personal information{"\n"}
                  {"\u2022"} Store only weekly statistical summaries{"\n"}
                  {"\u2022"} Use a one-way encrypted ID{"\n"}
                  {"\u2022"} Never share raw daily data
                </Text>
                <Text
                  style={[styles.consentNote, { color: colors.textSecondary }]}
                >
                  This is completely optional and you can change your mind
                  anytime in Settings.
                </Text>
              </View>
            </CardContent>
            <CardFooter>
              <Button
                title="Back"
                onPress={prevStep}
                variant="outline"
                style={styles.flex}
              />
              <Button
                title={dataConsent ? "Continue" : "Skip Survey"}
                onPress={nextStep}
                style={styles.flex}
              />
            </CardFooter>
          </Card>
        )}

        {/* Step 3: Health Survey */}
        {step === 3 && dataConsent && (
          <Card>
            <CardHeader>
              <View
                style={[
                  styles.stepIcon,
                  { backgroundColor: colors.primary + "20" },
                ]}
              >
                <ClipboardList size={20} color={colors.primary} />
              </View>
              <CardTitle>Quick Health Check-in</CardTitle>
              <CardDescription>
                A few questions about your habits to personalize your experience.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {surveyLoading || !surveyLoaded ? (
                <View style={styles.centered}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : surveyQuestions.length === 0 ? (
                <Text style={[styles.noSurvey, { color: colors.textMuted }]}>
                  No survey questions are available right now. You can continue.
                </Text>
              ) : (
                <View style={styles.surveyContainer}>
                  {surveyQuestions.map((q, idx) => (
                    <View key={q.id} style={styles.questionBlock}>
                      <Text style={[styles.questionText, { color: colors.text }]}>
                        {idx + 1}. {q.question_text}
                      </Text>
                      {q.response_type === "single_choice" &&
                      q.options?.choices ? (
                        <View style={styles.choicesContainer}>
                          {q.options.choices.map((choice) => (
                            <TouchableOpacity
                              key={choice}
                              onPress={() =>
                                setSurveyAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: choice,
                                }))
                              }
                              style={[
                                styles.choiceBtn,
                                {
                                  borderColor:
                                    surveyAnswers[q.id] === choice
                                      ? colors.primary
                                      : colors.border,
                                  backgroundColor:
                                    surveyAnswers[q.id] === choice
                                      ? colors.primary + "15"
                                      : "transparent",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.choiceText,
                                  {
                                    color:
                                      surveyAnswers[q.id] === choice
                                        ? colors.primary
                                        : colors.text,
                                    fontWeight:
                                      surveyAnswers[q.id] === choice
                                        ? "600"
                                        : "400",
                                  },
                                ]}
                              >
                                {choice}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : q.response_type === "scale" ? (
                        <View style={styles.scaleRow}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <TouchableOpacity
                              key={n}
                              onPress={() =>
                                setSurveyAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: String(n),
                                }))
                              }
                              style={[
                                styles.scaleBtn,
                                {
                                  borderColor:
                                    surveyAnswers[q.id] === String(n)
                                      ? colors.primary
                                      : colors.border,
                                  backgroundColor:
                                    surveyAnswers[q.id] === String(n)
                                      ? colors.primary + "15"
                                      : "transparent",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.scaleText,
                                  {
                                    color:
                                      surveyAnswers[q.id] === String(n)
                                        ? colors.primary
                                        : colors.text,
                                  },
                                ]}
                              >
                                {n}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </CardContent>
            <CardFooter>
              <Button
                title="Back"
                onPress={prevStep}
                variant="outline"
                style={styles.flex}
              />
              <Button
                title="Continue"
                onPress={nextStep}
                style={styles.flex}
              />
            </CardFooter>
          </Card>
        )}

        {/* Step 4: Demo Data + Finish */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <View
                style={[
                  styles.stepIcon,
                  { backgroundColor: colors.primary + "20" },
                ]}
              >
                <Sparkles size={20} color={colors.primary} />
              </View>
              <CardTitle>You're Almost Ready</CardTitle>
              <CardDescription>
                One last thing — would you like to start with sample data?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <View
                style={[
                  styles.consentCard,
                  { borderColor: colors.border },
                ]}
              >
                <SwitchRow
                  label="Load demo health data"
                  description="90 days of simulated wearable data so you can explore the app right away"
                  value={seedDemo}
                  onValueChange={setSeedDemo}
                />
              </View>

              {error ? (
                <View
                  style={[
                    styles.errorBanner,
                    { backgroundColor: colors.error + "15" },
                  ]}
                >
                  <Text style={[styles.errorText, { color: colors.error }]}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {/* Summary */}
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: colors.surface },
                ]}
              >
                <View style={styles.summaryHeader}>
                  <CheckCircle2 size={16} color={colors.primary} />
                  <Text style={[styles.summaryTitle, { color: colors.text }]}>
                    Your setup summary
                  </Text>
                </View>
                <View style={styles.summaryItems}>
                  <Text style={[styles.summaryItem, { color: colors.textSecondary }]}>
                    Timezone:{" "}
                    <Text style={[styles.summaryValue, { color: colors.text }]}>
                      {formatTimezone(timezone)}
                    </Text>
                  </Text>
                  <Text style={[styles.summaryItem, { color: colors.textSecondary }]}>
                    Anonymous data sharing:{" "}
                    <Text style={[styles.summaryValue, { color: colors.text }]}>
                      {dataConsent ? "Opted in" : "Not sharing"}
                    </Text>
                  </Text>
                  {dataConsent && Object.keys(surveyAnswers).length > 0 && (
                    <Text
                      style={[
                        styles.summaryItem,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Survey answers:{" "}
                      <Text
                        style={[styles.summaryValue, { color: colors.text }]}
                      >
                        {Object.keys(surveyAnswers).length} answered
                      </Text>
                    </Text>
                  )}
                  <Text style={[styles.summaryItem, { color: colors.textSecondary }]}>
                    Demo data:{" "}
                    <Text style={[styles.summaryValue, { color: colors.text }]}>
                      {seedDemo ? "Yes" : "No"}
                    </Text>
                  </Text>
                  {healthKit.authorized && (
                    <Text
                      style={[
                        styles.summaryItem,
                        { color: colors.textSecondary },
                      ]}
                    >
                      HealthKit:{" "}
                      <Text
                        style={[styles.summaryValue, { color: colors.success }]}
                      >
                        Connected
                      </Text>
                    </Text>
                  )}
                </View>
              </View>
            </CardContent>
            <CardFooter>
              <Button
                title="Back"
                onPress={prevStep}
                variant="outline"
                style={styles.flex}
              />
              <Button
                title={finishing ? "Setting up..." : "Finish Setup"}
                onPress={handleFinish}
                loading={finishing}
                disabled={finishing}
                style={styles.flex}
              />
            </CardFooter>
          </Card>
        )}
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
  progressContainer: {
    gap: 6,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressText: {
    fontSize: 11,
  },
  centeredHeader: {
    alignItems: "center",
  },
  bigIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTextWrap: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  featureDesc: {
    fontSize: 12,
  },
  healthKitSection: {
    gap: 10,
    marginTop: 4,
  },
  hkTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  hkDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  hkDoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hkDoneText: {
    fontSize: 14,
    fontWeight: "500",
  },
  fullWidth: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  tzButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tzText: {
    fontSize: 14,
  },
  tzList: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    maxHeight: 200,
  },
  tzItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tzItemText: {
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
    marginTop: 6,
  },
  consentCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  consentBody: {
    fontSize: 12,
  },
  consentBullet: {
    fontSize: 12,
    lineHeight: 20,
    marginLeft: 4,
  },
  consentNote: {
    fontSize: 12,
    lineHeight: 16,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  noSurvey: {
    fontSize: 13,
  },
  surveyContainer: {
    gap: 20,
  },
  questionBlock: {
    gap: 8,
  },
  questionText: {
    fontSize: 14,
    fontWeight: "500",
  },
  choicesContainer: {
    gap: 6,
  },
  choiceBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  choiceText: {
    fontSize: 14,
  },
  scaleRow: {
    flexDirection: "row",
    gap: 8,
  },
  scaleBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scaleText: {
    fontSize: 15,
    fontWeight: "500",
  },
  errorBanner: {
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
  },
  summaryCard: {
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  summaryItems: {
    gap: 4,
    marginLeft: 24,
  },
  summaryItem: {
    fontSize: 12,
  },
  summaryValue: {
    fontWeight: "500",
  },
});
