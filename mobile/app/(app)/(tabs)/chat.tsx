/**
 * Chat screen — AI health chat with session management.
 *
 * Features:
 * - Session list (bottom sheet)
 * - Message bubbles (user/assistant)
 * - Emergency banner with tel: links
 * - Starter questions
 * - Rate limit (20/day)
 *
 * Ported from frontend/app/(app)/chat/_chat-client.tsx
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  MessageCircle,
  Send,
  Plus,
  List,
  Phone,
  AlertTriangle,
} from "lucide-react-native";
import { useThemeColors } from "../../../hooks/useThemeColors";
import { api } from "../../../services/api";
import type {
  ChatSession,
  ChatMessage,
  ChatReply,
  EmergencyReply,
} from "../../../services/api";

const STARTER_QUESTIONS = [
  "How did I sleep this week?",
  "What are my HRV trends?",
  "How can I improve my recovery?",
  "Summarize my activity this week",
];

const MAX_MESSAGES_PER_DAY = 20;

export default function ChatScreen() {
  const colors = useThemeColors();
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Sessions
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [showSessions, setShowSessions] = useState(false);

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [todayCount, setTodayCount] = useState(0);

  // Emergency
  const [emergency, setEmergency] = useState<EmergencyReply | null>(null);

  // ---------------------------------------------------------------------------
  // Load sessions on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const res = await api.getChatSessions({ limit: 50 });
      setSessions(res.items);
      if (res.items.length > 0 && !activeSession) {
        selectSession(res.items[0]);
      }
    } catch {
      // Handle silently
    }
  };

  // ---------------------------------------------------------------------------
  // Load messages for active session
  // ---------------------------------------------------------------------------

  const selectSession = async (session: ChatSession) => {
    setActiveSession(session);
    setShowSessions(false);
    setEmergency(null);
    setLoadingMessages(true);

    try {
      const res = await api.getChatMessages(session.id, { limit: 100 });
      setMessages(res.items.reverse());

      // Count today's user messages
      const today = new Date().toISOString().split("T")[0];
      const todayMessages = res.items.filter(
        (m) => m.role === "user" && m.created_at.startsWith(today)
      );
      setTodayCount(todayMessages.length);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Create new session
  // ---------------------------------------------------------------------------

  const createNewSession = async () => {
    try {
      const session = await api.createChatSession();
      setSessions((prev) => [session, ...prev]);
      setActiveSession(session);
      setMessages([]);
      setEmergency(null);
      setShowSessions(false);
      setTodayCount(0);
    } catch {
      Alert.alert("Error", "Could not create a new chat session.");
    }
  };

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || sending) return;
      if (todayCount >= MAX_MESSAGES_PER_DAY) {
        Alert.alert(
          "Rate Limit",
          "You've reached the daily limit of 20 messages. Try again tomorrow."
        );
        return;
      }

      let session = activeSession;

      // Auto-create session if none exists
      if (!session) {
        try {
          session = await api.createChatSession();
          setSessions((prev) => [session!, ...prev]);
          setActiveSession(session);
        } catch {
          Alert.alert("Error", "Could not create a chat session.");
          return;
        }
      }

      const userMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        session_id: session.id,
        user_id: "",
        role: "user",
        content: content.trim(),
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);
      setTodayCount((c) => c + 1);

      try {
        const reply = await api.sendMessage(session.id, content.trim());

        if ("emergency" in reply) {
          const emergencyReply = reply as EmergencyReply;
          setEmergency(emergencyReply);
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== userMsg.id),
            emergencyReply.user_message,
            emergencyReply.assistant_message,
          ]);
        } else {
          const chatReply = reply as ChatReply;
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== userMsg.id),
            chatReply.user_message,
            chatReply.assistant_message,
          ]);
        }
      } catch {
        // Remove optimistic user message on failure
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setTodayCount((c) => Math.max(0, c - 1));
        Alert.alert("Error", "Failed to send message. Please try again.");
      } finally {
        setSending(false);
      }
    },
    [activeSession, sending, todayCount]
  );

  // ---------------------------------------------------------------------------
  // Scroll to bottom when messages change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const remaining = MAX_MESSAGES_PER_DAY - todayCount;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <TouchableOpacity
            onPress={() => setShowSessions(!showSessions)}
            style={styles.headerBtn}
          >
            <List size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {activeSession?.title || "Health Chat"}
          </Text>
          <TouchableOpacity onPress={createNewSession} style={styles.headerBtn}>
            <Plus size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Emergency Banner */}
        {emergency && (
          <View
            style={[styles.emergencyBanner, { backgroundColor: colors.error + "15" }]}
          >
            <View style={styles.emergencyHeader}>
              <AlertTriangle size={16} color={colors.error} />
              <Text style={[styles.emergencyTitle, { color: colors.error }]}>
                If you're in crisis
              </Text>
            </View>
            <Text
              style={[styles.emergencyText, { color: colors.text }]}
            >
              {emergency.message}
            </Text>
            {emergency.hotlines.map((h) => (
              <TouchableOpacity
                key={h.number}
                onPress={() => Linking.openURL(`tel:${h.number}`)}
                style={[
                  styles.hotlineBtn,
                  { backgroundColor: colors.error + "20" },
                ]}
              >
                <Phone size={14} color={colors.error} />
                <Text style={[styles.hotlineText, { color: colors.error }]}>
                  {h.name}: {h.number}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Session list overlay */}
        {showSessions && (
          <View
            style={[
              styles.sessionList,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <FlatList
              data={sessions}
              keyExtractor={(s) => s.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => selectSession(item)}
                  style={[
                    styles.sessionItem,
                    {
                      backgroundColor:
                        item.id === activeSession?.id
                          ? colors.primary + "15"
                          : "transparent",
                    },
                  ]}
                >
                  <MessageCircle
                    size={14}
                    color={
                      item.id === activeSession?.id
                        ? colors.primary
                        : colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.sessionTitle,
                      {
                        color:
                          item.id === activeSession?.id
                            ? colors.primary
                            : colors.text,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {item.title || "New Chat"}
                  </Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, backgroundColor: colors.separator }} />
              )}
              ListEmptyComponent={
                <Text
                  style={[
                    styles.emptySessionText,
                    { color: colors.textMuted },
                  ]}
                >
                  No sessions yet
                </Text>
              }
            />
          </View>
        )}

        {/* Messages */}
        {loadingMessages ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : messages.length === 0 && !activeSession ? (
          // Empty state with starter questions
          <View style={styles.starterContainer}>
            <MessageCircle size={40} color={colors.primary + "40"} />
            <Text style={[styles.starterTitle, { color: colors.text }]}>
              Ask about your health
            </Text>
            <Text
              style={[
                styles.starterSubtitle,
                { color: colors.textSecondary },
              ]}
            >
              Chat with AI about your health data and trends
            </Text>
            <View style={styles.starterQuestions}>
              {STARTER_QUESTIONS.map((q) => (
                <TouchableOpacity
                  key={q}
                  onPress={() => sendMessage(q)}
                  style={[
                    styles.starterBtn,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                  ]}
                >
                  <Text style={[styles.starterBtnText, { color: colors.text }]}>
                    {q}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.messageList}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.messageBubble,
                  item.role === "user"
                    ? [
                        styles.userBubble,
                        { backgroundColor: colors.primary },
                      ]
                    : [
                        styles.assistantBubble,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ],
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    {
                      color:
                        item.role === "user"
                          ? colors.primaryForeground
                          : colors.text,
                    },
                  ]}
                >
                  {item.content}
                </Text>
              </View>
            )}
          />
        )}

        {/* Input */}
        <View
          style={[
            styles.inputBar,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          {remaining <= 5 && remaining > 0 && (
            <Text style={[styles.rateLimit, { color: colors.warning }]}>
              {remaining} messages remaining today
            </Text>
          )}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your health..."
              placeholderTextColor={colors.textMuted}
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage(input)}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || sending}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    input.trim() && !sending
                      ? colors.primary
                      : colors.border,
                },
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Send size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  emergencyBanner: {
    padding: 14,
    gap: 8,
  },
  emergencyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emergencyTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  emergencyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  hotlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  hotlineText: {
    fontSize: 13,
    fontWeight: "600",
  },
  sessionList: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    maxHeight: 300,
    zIndex: 10,
    borderBottomWidth: 1,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  emptySessionText: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  starterContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  starterTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 8,
  },
  starterSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  starterQuestions: {
    gap: 8,
    marginTop: 16,
    width: "100%",
  },
  starterBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  starterBtnText: {
    fontSize: 14,
  },
  messageList: {
    padding: 16,
    gap: 10,
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: 16,
    padding: 12,
  },
  userBubble: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 21,
  },
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 0.5,
  },
  rateLimit: {
    fontSize: 11,
    textAlign: "center",
    marginBottom: 6,
    fontWeight: "500",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
