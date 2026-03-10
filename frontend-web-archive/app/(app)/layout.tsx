import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Redirect to onboarding if not onboarded
  const onboardedAt = (session.user as unknown as Record<string, unknown>)
    .onboardedAt;
  if (!onboardedAt) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      {/* Main content area */}
      <main className="md:pl-56">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>

        {/* Disclaimer footer */}
        <footer className="border-t border-border mt-8">
          <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
            <p className="text-xs text-muted-foreground text-center">
              VitalView provides wellness insights, not medical advice. Always
              consult a healthcare professional for medical concerns.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
