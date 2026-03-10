import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Heart } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 pb-16">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Heart className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          VitalView
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          Your personal health narrative. Weekly insights from your wearable
          data, powered by AI.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full sm:w-auto">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/login">Sign In</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/signup">Create Account</Link>
          </Button>
        </div>
      </div>
      <p className="fixed bottom-6 left-4 right-4 text-xs text-muted-foreground text-center">
        VitalView provides wellness insights, not medical advice.
      </p>
    </div>
  );
}
