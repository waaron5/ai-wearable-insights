import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import OnboardingWizard from "./_onboarding-wizard";

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Already onboarded — go to dashboard
  const onboardedAt = (session.user as unknown as Record<string, unknown>)
    .onboardedAt;
  if (onboardedAt) {
    redirect("/dashboard");
  }

  return <OnboardingWizard />;
}
