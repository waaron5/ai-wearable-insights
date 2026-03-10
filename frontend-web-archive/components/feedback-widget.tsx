"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Send, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export function FeedbackWidget({ debriefId }: { debriefId: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleRate = (value: number) => {
    setRating(value);
    setShowComment(true);
  };

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);
    try {
      await api.submitFeedback(debriefId, {
        rating,
        comment: comment.trim() || undefined,
      });
      setSubmitted(true);
    } catch {
      // Silently handle — not critical
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-primary" />
        Thanks for your feedback!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          Was this helpful?
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              rating === 5 && "bg-primary/10 text-primary"
            )}
            onClick={() => handleRate(5)}
          >
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              rating === 1 && "bg-destructive/10 text-destructive"
            )}
            onClick={() => handleRate(1)}
          >
            <ThumbsDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showComment && (
        <div className="flex gap-2">
          <Textarea
            placeholder="Any additional thoughts? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[60px] text-sm resize-none"
          />
          <Button
            size="icon"
            className="h-[60px] w-10 shrink-0"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
