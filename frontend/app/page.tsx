import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Heart } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Heart className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          VitalView
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Your personal health narrative. Weekly insights from your wearable
          data, powered by AI.
        </p>
        <div className="flex gap-3 mt-2">
          <Button asChild size="lg">
            <Link href="/login">Sign In</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/signup">Create Account</Link>
          </Button>
        </div>
      </div>
      <p className="absolute bottom-6 text-xs text-muted-foreground">
        VitalView provides wellness insights, not medical advice.
      </p>
    </div>
  );
}
