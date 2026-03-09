/**
 * Themed card component — matches the web Card component.
 */

import React from "react";
import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { useThemeColors } from "../../hooks/useThemeColors";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardHeader({ children, style }: CardHeaderProps) {
  return <View style={[styles.header, style]}>{children}</View>;
}

interface CardTitleProps {
  children: string;
  size?: "sm" | "md" | "lg";
}

export function CardTitle({ children, size = "md" }: CardTitleProps) {
  const colors = useThemeColors();
  const fontSize = size === "sm" ? 14 : size === "lg" ? 20 : 16;

  return (
    <Text
      style={[styles.title, { color: colors.text, fontSize }]}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}

interface CardDescriptionProps {
  children: string;
}

export function CardDescription({ children }: CardDescriptionProps) {
  const colors = useThemeColors();

  return (
    <Text style={[styles.description, { color: colors.textSecondary }]}>
      {children}
    </Text>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardContent({ children, style }: CardContentProps) {
  return <View style={[styles.content, style]}>{children}</View>;
}

interface CardFooterProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardFooter({ children, style }: CardFooterProps) {
  return <View style={[styles.footer, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    padding: 16,
    paddingBottom: 8,
    gap: 4,
  },
  title: {
    fontWeight: "600",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    gap: 12,
  },
});
