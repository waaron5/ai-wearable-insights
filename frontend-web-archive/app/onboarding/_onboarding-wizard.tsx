"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Heart,
  Globe,
  Shield,
  ClipboardList,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { api, type SurveyQuestion } from "@/lib/api";

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

export default function OnboardingWizard() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [step, setStep] = useState(0);
  const [timezone, setTimezone] = useState(detectTimezone);
  const [dataConsent, setDataConsent] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [surveyLoaded, setSurveyLoaded] = useState(false);
  const [seedDemo, setSeedDemo] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");

  // Load survey questions when entering survey step
  useEffect(() => {
    if (step === 3 && dataConsent && !surveyLoaded) {
      const loadSurveyQuestions = async () => {
        setSurveyLoading(true);
        try {
          const questions = await api.getSurveyQuestions();
          setSurveyQuestions(questions);
        } catch {
          // If no questions available, that's OK — skip survey
        } finally {
          setSurveyLoading(false);
          setSurveyLoaded(true);
        }
      };

      void loadSurveyQuestions();
    }
  }, [step, dataConsent, surveyLoaded]);

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  const handleFinish = useCallback(async () => {
    setFinishing(true);
    setError("");

    try {
      // 1. Set timezone
      await api.updateMe({ timezone });

      // 2. Set data sharing consent
      if (dataConsent) {
        await api.updateConsent({ data_sharing_consent: true });
      }

      // 3. Submit survey answers if any
      if (dataConsent && Object.keys(surveyAnswers).length > 0) {
        const answers = Object.entries(surveyAnswers).map(
          ([question_id, response_value]) => ({ question_id, response_value })
        );
        await api.submitSurveyResponses({
          answers,
          survey_context: "onboarding",
        });
      }

      // 4. Seed demo data if selected
      if (seedDemo) {
        await api.seedDemo();
      }

      // 5. Mark as onboarded
      const onboardedAt = new Date().toISOString();
      await api.updateMe({ onboarded_at: onboardedAt });

      // 6. Refresh session to pick up onboarded_at
      await updateSession({ onboardedAt });

      // 7. Redirect to dashboard
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("Onboarding error:", err);
      setError("Something went wrong. Please try again.");
      setFinishing(false);
    }
  }, [timezone, dataConsent, surveyAnswers, seedDemo, router, updateSession]);

  const canAdvance = () => {
    if (step === 1 && !timezone) return false;
    return true;
  };

  const nextStep = () => {
    // Skip survey step if no consent
    if (step === 2 && !dataConsent) {
      setStep(4);
    } else if (step === 3 && surveyQuestions.length === 0) {
      setStep(4);
    } else {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    }
  };

  const prevStep = () => {
    // Skip back over survey if no consent
    if (step === 4 && !dataConsent) {
      setStep(2);
    } else if (step === 4 && surveyQuestions.length === 0) {
      setStep(2);
    } else {
      setStep((s) => Math.max(s - 1, 0));
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {TOTAL_STEPS}
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <Card>
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Heart className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl">Welcome to VitalView</CardTitle>
              <CardDescription className="text-base mt-2 leading-relaxed">
                Your personal health narrative. We analyze your wearable data
                and deliver weekly insights — what happened, what to pay
                attention to, and what to try next.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-3">
                {[
                  {
                    icon: Sparkles,
                    title: "Weekly AI Debriefs",
                    desc: "A personalized written health narrative every week",
                  },
                  {
                    icon: ClipboardList,
                    title: "Track Your Trends",
                    desc: "Sleep, HRV, resting heart rate, and activity",
                  },
                  {
                    icon: Shield,
                    title: "Private & Secure",
                    desc: "Your data is encrypted and never shared without consent",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={nextStep}>
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 1: Timezone */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-2">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>Your Timezone</CardTitle>
              <CardDescription>
                We use this to schedule your weekly debriefs at the right time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-full">
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
              <p className="text-xs text-muted-foreground mt-3">
                Auto-detected from your browser. You can change this anytime in
                Settings.
              </p>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button variant="outline" onClick={prevStep} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={nextStep}
                disabled={!canAdvance()}
                className="flex-1"
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 2: Data Sharing Consent */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-2">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>Help Improve Health Insights</CardTitle>
              <CardDescription>
                Optionally contribute anonymized data to improve insights for
                everyone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="consent"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Share anonymized health data
                  </Label>
                  <Switch
                    id="consent"
                    checked={dataConsent}
                    onCheckedChange={setDataConsent}
                  />
                </div>
                <Separator />
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>If you opt in, we will:</p>
                  <ul className="list-disc list-inside space-y-1 ml-1">
                    <li>Strip all personal information (name, email, etc.)</li>
                    <li>Store only weekly statistical summaries</li>
                    <li>Use a one-way encrypted ID (no way to trace back to you)</li>
                    <li>Never share raw daily data</li>
                  </ul>
                  <p className="pt-1">
                    This is completely optional and you can change your mind
                    anytime in Settings. Your personal experience is the same
                    either way.
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button variant="outline" onClick={prevStep} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={nextStep} className="flex-1">
                {dataConsent ? "Continue" : "Skip Survey"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 3: Health Survey */}
        {step === 3 && dataConsent && (
          <Card>
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-2">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>Quick Health Check-in</CardTitle>
              <CardDescription>
                A few questions about your habits to personalize your experience.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {surveyLoading || !surveyLoaded ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : surveyQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No survey questions are available right now. You can continue.
                </p>
              ) : (
                <div className="space-y-5">
                  {surveyQuestions.map((q, idx) => (
                    <div key={q.id} className="space-y-2">
                      <Label className="text-sm">
                        {idx + 1}. {q.question_text}
                      </Label>
                      {q.response_type === "single_choice" && q.options?.choices ? (
                        <div className="grid gap-1.5">
                          {q.options.choices.map((choice) => (
                            <button
                              key={choice}
                              type="button"
                              onClick={() =>
                                setSurveyAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: choice,
                                }))
                              }
                              className={`text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                                surveyAnswers[q.id] === choice
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "border-border hover:bg-muted"
                              }`}
                            >
                              {choice}
                            </button>
                          ))}
                        </div>
                      ) : q.response_type === "scale" ? (
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() =>
                                setSurveyAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: String(n),
                                }))
                              }
                              className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                                surveyAnswers[q.id] === String(n)
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border hover:bg-muted"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={surveyAnswers[q.id] || ""}
                          onChange={(e) =>
                            setSurveyAnswers((prev) => ({
                              ...prev,
                              [q.id]: e.target.value,
                            }))
                          }
                          placeholder="Your answer..."
                          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button variant="outline" onClick={prevStep} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={nextStep} className="flex-1">
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 4: Demo Data + Finish */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>You&apos;re Almost Ready</CardTitle>
              <CardDescription>
                One last thing — would you like to start with sample data?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label
                      htmlFor="demo"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Load demo health data
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      90 days of simulated wearable data so you can explore the
                      app right away
                    </p>
                  </div>
                  <Switch
                    id="demo"
                    checked={seedDemo}
                    onCheckedChange={setSeedDemo}
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Your setup summary
                </p>
                <div className="grid gap-1 text-xs text-muted-foreground ml-6">
                  <p>
                    Timezone:{" "}
                    <span className="text-foreground font-medium">
                      {formatTimezone(timezone)}
                    </span>
                  </p>
                  <p>
                    Anonymous data sharing:{" "}
                    <span className="text-foreground font-medium">
                      {dataConsent ? "Opted in" : "Not sharing"}
                    </span>
                  </p>
                  {dataConsent &&
                    Object.keys(surveyAnswers).length > 0 && (
                      <p>
                        Survey answers:{" "}
                        <span className="text-foreground font-medium">
                          {Object.keys(surveyAnswers).length} answered
                        </span>
                      </p>
                    )}
                  <p>
                    Demo data:{" "}
                    <span className="text-foreground font-medium">
                      {seedDemo ? "Yes" : "No"}
                    </span>
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button variant="outline" onClick={prevStep} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleFinish}
                disabled={finishing}
                className="flex-1"
              >
                {finishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    Finish Setup
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
