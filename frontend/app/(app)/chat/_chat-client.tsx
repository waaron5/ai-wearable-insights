"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  ChatMessage,
  ChatReply,
  ChatSession,
  EmergencyReply,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertTriangle,
  Bot,
  Loader2,
  MessageSquarePlus,
  PanelLeftOpen,
  Phone,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────

const DAILY_LIMIT = 20;

const STARTER_QUESTIONS = [
  "How did I sleep this week?",
  "What's my HRV trend looking like?",
  "Summarize my activity this week",
  "What should I focus on improving?",
];

// ─── Type guard ───────────────────────────────────────────────────

function isEmergency(
  reply: ChatReply | EmergencyReply
): reply is EmergencyReply {
  return "emergency" in reply && reply.emergency === true;
}

// ─── Emergency Banner ─────────────────────────────────────────────

function EmergencyBanner({
  message,
  hotlines,
}: {
  message: string;
  hotlines: { name: string; number: string }[];
}) {
  return (
    <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <p className="text-sm font-medium text-destructive">{message}</p>
      </div>
      <div className="space-y-1.5">
        {hotlines.map((h) => (
          <a
            key={h.number}
            href={`tel:${h.number}`}
            className="flex items-center gap-2 text-sm font-medium text-destructive hover:underline"
          >
            <Phone className="h-4 w-4" />
            {h.name}: {h.number}
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={cn("flex gap-2.5 max-w-[85%]", isUser ? "ml-auto" : "mr-auto")}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div
        className={cn(
          "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md"
        )}
      >
        {msg.content}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

// ─── Session Sidebar Content ──────────────────────────────────────

function SessionList({
  sessions,
  activeId,
  onSelect,
  onCreate,
  loading,
}: {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button onClick={onCreate} className="w-full gap-2" size="sm">
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </Button>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-2 py-2">
        {loading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No conversations yet
          </p>
        ) : (
          <div className="space-y-1">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                  s.id === activeId
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted text-foreground"
                )}
              >
                <p className="truncate text-sm font-medium">
                  {s.title || "New conversation"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(s.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ─── Main Chat Client ─────────────────────────────────────────────

export default function ChatClient() {
  // Sessions state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Messages state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Input state
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Emergency state (most recent if any)
  const [emergencyData, setEmergencyData] = useState<{
    message: string;
    hotlines: { name: string; number: string }[];
  } | null>(null);

  // Rate limit
  const [messagesUsed, setMessagesUsed] = useState(0);

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, emergencyData]);

  // Load sessions on mount
  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await api.getChatSessions({ limit: 50 });
        setSessions(res.items);
        // Auto-select most recent session if exists
        if (res.items.length > 0) {
          setActiveSessionId(res.items[0].id);
        }
      } catch {
        // silently fail
      } finally {
        setSessionsLoading(false);
      }
    }
    loadSessions();
  }, []);

  // Load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    async function load() {
      setMessagesLoading(true);
      setEmergencyData(null);
      try {
        const res = await api.getChatMessages(activeSessionId!, { limit: 100 });
        setMessages(res.items);
        // Count user messages today for rate limit
        const today = new Date().toISOString().slice(0, 10);
        const todayUserMsgs = res.items.filter(
          (m) => m.role === "user" && m.created_at.slice(0, 10) === today
        );
        setMessagesUsed(todayUserMsgs.length);
      } catch {
        setMessages([]);
      } finally {
        setMessagesLoading(false);
      }
    }
    load();
  }, [activeSessionId]);

  // Create new session
  const handleNewSession = useCallback(async () => {
    try {
      const session = await api.createChatSession();
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessages([]);
      setEmergencyData(null);
      setSidebarOpen(false);
    } catch {
      // silently fail
    }
  }, []);

  // Select a session
  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    setSidebarOpen(false);
  }, []);

  // Send message
  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text || input).trim();
      if (!content || sending) return;
      if (messagesUsed >= DAILY_LIMIT) return;

      // If no active session, create one first
      let sessionId = activeSessionId;
      if (!sessionId) {
        try {
          const session = await api.createChatSession({
            title: content.slice(0, 60),
          });
          setSessions((prev) => [session, ...prev]);
          setActiveSessionId(session.id);
          sessionId = session.id;
        } catch {
          return;
        }
      }

      // Optimistically add user message
      const tempUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        session_id: sessionId,
        user_id: "",
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);
      setInput("");
      setSending(true);
      setEmergencyData(null);

      try {
        const reply = await api.sendMessage(sessionId, content);

        if (isEmergency(reply)) {
          // Replace temp with real + add assistant message + emergency data
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== tempUserMsg.id),
            reply.user_message,
            reply.assistant_message,
          ]);
          setEmergencyData({
            message: reply.message,
            hotlines: reply.hotlines,
          });
        } else {
          // Replace temp user msg with real + add assistant message
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== tempUserMsg.id),
            reply.user_message,
            reply.assistant_message,
          ]);
        }

        // Update session title if first message
        if (messages.length === 0) {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? { ...s, title: content.slice(0, 60) }
                : s
            )
          );
        }

        setMessagesUsed((prev) => prev + 1);
      } catch (err) {
        // Remove the optimistic message on error
        setMessages((prev) =>
          prev.filter((m) => m.id !== tempUserMsg.id)
        );

        if (err instanceof ApiError && err.status === 429) {
          setMessagesUsed(DAILY_LIMIT);
        }
      } finally {
        setSending(false);
        textareaRef.current?.focus();
      }
    },
    [activeSessionId, input, sending, messagesUsed, messages.length]
  );

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const remaining = DAILY_LIMIT - messagesUsed;
  const atLimit = remaining <= 0;

  // ── Sidebar content (reused in sheet + desktop) ──

  const sidebarContent = (
    <SessionList
      sessions={sessions}
      activeId={activeSessionId}
      onSelect={handleSelectSession}
      onCreate={handleNewSession}
      loading={sessionsLoading}
    />
  );

  // ── Render ──

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-xl border bg-card">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r md:flex md:flex-col">
        {sidebarContent}
      </aside>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          {/* Mobile sidebar trigger */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <PanelLeftOpen className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              {sidebarContent}
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <h2 className="text-sm font-semibold truncate">
              {activeSessionId
                ? sessions.find((s) => s.id === activeSessionId)?.title ||
                  "New conversation"
                : "Health Chat"}
            </h2>
          </div>

          <Badge
            variant={atLimit ? "destructive" : "secondary"}
            className="shrink-0 text-xs"
          >
            {atLimit ? "Limit reached" : `${remaining} left today`}
          </Badge>
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {messagesLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2.5",
                    i % 2 === 0 ? "mr-auto max-w-[70%]" : "ml-auto max-w-[60%]"
                  )}
                >
                  {i % 2 === 0 && (
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  )}
                  <Skeleton
                    className={cn(
                      "h-14 w-full rounded-2xl",
                      i % 2 === 0 ? "rounded-bl-md" : "rounded-br-md"
                    )}
                  />
                  {i % 2 !== 0 && (
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  )}
                </div>
              ))}
            </div>
          ) : messages.length === 0 && !activeSessionId ? (
            /* No session selected — welcome state */
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">
                Ask about your health data
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                I can help you understand your sleep, HRV, heart rate, and
                activity trends. Start a conversation below.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 w-full max-w-md">
                {STARTER_QUESTIONS.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    className="h-auto whitespace-normal text-left px-4 py-3 text-sm"
                    onClick={() => handleSend(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : messages.length === 0 ? (
            /* Empty session — starters */
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <Bot className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground max-w-xs mb-5">
                What would you like to know about your health data?
              </p>
              <div className="grid gap-2 sm:grid-cols-2 w-full max-w-md">
                {STARTER_QUESTIONS.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    className="h-auto whitespace-normal text-left px-4 py-3 text-sm"
                    onClick={() => handleSend(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages */
            <div className="space-y-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {emergencyData && (
                <EmergencyBanner
                  message={emergencyData.message}
                  hotlines={emergencyData.hotlines}
                />
              )}
              {sending && (
                <div className="flex gap-2.5 mr-auto max-w-[85%]">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Disclaimer */}
        {messages.length > 0 && (
          <div className="px-4 pb-1">
            <p className="text-[11px] text-muted-foreground text-center">
              AI responses are wellness insights only, not medical advice.
            </p>
          </div>
        )}

        {/* Input area */}
        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              placeholder={
                atLimit
                  ? "Daily message limit reached — try again tomorrow"
                  : "Ask about your health data…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={atLimit || sending}
              rows={1}
              className="min-h-[44px] max-h-32 resize-none"
            />
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || atLimit || sending}
              className="shrink-0 h-[44px] w-[44px]"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
