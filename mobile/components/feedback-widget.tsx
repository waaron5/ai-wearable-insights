/**
 * FeedbackWidget — thumbs up/down + optional comment.
 * Ported from frontend/components/feedback-widget.tsx.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { ThumbsUp, ThumbsDown, Send, Check } from "lucide-react-native";
import { useThemeColors } from "../hooks/useThemeColors";
import { api } from "../services/api";

interface FeedbackWidgetProps {
  debriefId: string;
}

export function FeedbackWidget({ debriefId }: FeedbackWidgetProps) {
  const colors = useThemeColors();
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
      <View style={styles.doneRow}>
        <Check size={16} color={colors.primary} />
        <Text style={[styles.doneText, { color: colors.textSecondary }]}>
          Thanks for your feedback!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.ratingRow}>
        <Text style={[styles.prompt, { color: colors.textSecondary }]}>
          Was this helpful?
        </Text>
        <View style={styles.buttons}>
          <TouchableOpacity
            onPress={() => handleRate(5)}
            style={[
              styles.iconBtn,
              {
                backgroundColor:
                  rating === 5 ? colors.primary + "20" : "transparent",
              },
            ]}
          >
            <ThumbsUp
              size={18}
              color={rating === 5 ? colors.primary : colors.textMuted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleRate(1)}
            style={[
              styles.iconBtn,
              {
                backgroundColor:
                  rating === 1 ? colors.error + "20" : "transparent",
              },
            ]}
          >
            <ThumbsDown
              size={18}
              color={rating === 1 ? colors.error : colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>

      {showComment && (
        <View style={styles.commentRow}>
          <TextInput
            placeholder="Any additional thoughts? (optional)"
            placeholderTextColor={colors.textMuted}
            value={comment}
            onChangeText={setComment}
            style={[
              styles.textInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            multiline
          />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            style={[styles.sendBtn, { backgroundColor: colors.primary }]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  prompt: {
    fontSize: 13,
  },
  buttons: {
    flexDirection: "row",
    gap: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  commentRow: {
    flexDirection: "row",
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: "top",
  },
  sendBtn: {
    width: 44,
    height: 60,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  doneText: {
    fontSize: 13,
  },
});
