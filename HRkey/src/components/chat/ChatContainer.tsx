"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatInput from "@/components/chat/ChatInput";
import MessageBubble, { type ChatMessage } from "@/components/chat/MessageBubble";
import TypingIndicator from "@/components/chat/TypingIndicator";
import { ApiClientError, apiPost } from "@/lib/apiClient";

type PersistedConversation = {
  version: 1;
  conversationState: Record<string, unknown>;
  messages: ChatMessage[];
  completed: boolean;
};

type LouBackendMessage = {
  role?: string;
  content?: string;
};

type StartResponse = {
  ok: boolean;
  conversationState: {
    messages?: LouBackendMessage[];
  } & Record<string, unknown>;
};

type MessageResponse = {
  ok: boolean;
  response: string;
  conversationState: Record<string, unknown>;
  meta?: {
    completed?: boolean;
  } & Record<string, unknown>;
};

const STORAGE_KEY = "lou_conversation";
const STORAGE_VERSION = 1;
const DEFAULT_START_ERROR = "Unable to start the reference builder conversation.";
const DEFAULT_MESSAGE_ERROR = "Unable to continue the conversation right now.";

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    role,
    content,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChatMessage(value: unknown): value is ChatMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.role === "user" || value.role === "lou") &&
    typeof value.content === "string"
  );
}

function extractInitialPrompt(conversationState: StartResponse["conversationState"]): string {
  const lastAssistantMessage = conversationState.messages
    ?.filter((message) => message.role === "assistant" && typeof message.content === "string")
    .at(-1)?.content;

  return lastAssistantMessage && lastAssistantMessage.trim()
    ? lastAssistantMessage
    : "To start, what was your working relationship with the candidate, and how closely did you work together?";
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}

function readPersistedConversation(): PersistedConversation | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<PersistedConversation>;

    if (
      parsed?.version !== STORAGE_VERSION ||
      !isRecord(parsed.conversationState) ||
      !Array.isArray(parsed.messages) ||
      !parsed.messages.every(isChatMessage) ||
      typeof parsed.completed !== "boolean"
    ) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return {
      version: STORAGE_VERSION,
      conversationState: parsed.conversationState,
      messages: parsed.messages,
      completed: parsed.completed,
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export default function ChatContainer() {
  const [conversationState, setConversationState] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [completed, setCompleted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeRequestRef = useRef(0);

  const persistConversation = useCallback((nextState: Record<string, unknown>, nextMessages: ChatMessage[], nextCompleted: boolean) => {
    if (typeof window === "undefined") return;

    const payload: PersistedConversation = {
      version: STORAGE_VERSION,
      conversationState: nextState,
      messages: nextMessages,
      completed: nextCompleted,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, []);

  const clearPersistedConversation = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  const initializeConversation = useCallback(async () => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const data = await apiPost<StartResponse>("/api/lou-agent/start", {});

      if (!data.ok || !isRecord(data.conversationState)) {
        throw new Error(DEFAULT_START_ERROR);
      }

      if (requestId !== activeRequestRef.current) {
        return;
      }

      const initialMessage = createMessage("lou", extractInitialPrompt(data.conversationState));

      setConversationState(data.conversationState);
      setMessages([initialMessage]);
      setCompleted(false);
      setInput("");
      setLastUserMessage(null);
      persistConversation(data.conversationState, [initialMessage], false);
    } catch (err) {
      if (requestId !== activeRequestRef.current) {
        return;
      }
      setError(getErrorMessage(err, DEFAULT_START_ERROR));
    } finally {
      if (requestId === activeRequestRef.current) {
        setLoading(false);
      }
    }
  }, [persistConversation]);

  const resetConversation = useCallback(() => {
    if (loading) return;

    activeRequestRef.current += 1;
    clearPersistedConversation();
    setConversationState(null);
    setMessages([]);
    setInput("");
    setLoading(false);
    setError(null);
    setLastUserMessage(null);
    setCompleted(false);
  }, [clearPersistedConversation, loading]);

  useEffect(() => {
    const persisted = readPersistedConversation();
    if (persisted) {
      setConversationState(persisted.conversationState);
      setMessages(persisted.messages);
      setCompleted(persisted.completed);
    }

    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (messages.length > 0 || conversationState) return;
    void initializeConversation();
  }, [conversationState, hasHydrated, initializeConversation, messages.length]);

  useEffect(() => {
    if (!hasHydrated) return;
    scrollToBottom(messages.length > 1 ? "smooth" : "auto");
  }, [hasHydrated, loading, messages, scrollToBottom]);

  const sendMessage = useCallback(
    async (messageOverride?: string) => {
      const rawMessage = messageOverride ?? input;
      const trimmedMessage = rawMessage.trim();

      if (!trimmedMessage || loading || !conversationState || completed) {
        return;
      }

      const userMessage = createMessage("user", trimmedMessage);
      const previousMessages = messages;
      const optimisticMessages = [...previousMessages, userMessage];
      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;

      setMessages(optimisticMessages);
      setInput("");
      setLoading(true);
      setError(null);
      setLastUserMessage(trimmedMessage);

      try {
        const data = await apiPost<MessageResponse>("/api/lou-agent/message", {
          conversationState,
          message: trimmedMessage,
        });

        if (!data.ok || !isRecord(data.conversationState) || typeof data.response !== "string") {
          throw new Error(DEFAULT_MESSAGE_ERROR);
        }

        if (requestId !== activeRequestRef.current) {
          return;
        }

        const isComplete = Boolean(data.meta?.completed);
        const louMessage = createMessage("lou", data.response);
        const nextMessages = [...optimisticMessages, louMessage];

        setConversationState(data.conversationState);
        setMessages(nextMessages);
        setCompleted(isComplete);
        persistConversation(data.conversationState, nextMessages, isComplete);
      } catch (err) {
        if (requestId !== activeRequestRef.current) {
          return;
        }

        setMessages(previousMessages);
        setInput(trimmedMessage);
        setError(getErrorMessage(err, DEFAULT_MESSAGE_ERROR));
      } finally {
        if (requestId === activeRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [completed, conversationState, input, loading, messages, persistConversation]
  );

  const retryLabel = useMemo(() => {
    if (!lastUserMessage) return "Retry";
    return `Retry sending: “${lastUserMessage.length > 48 ? `${lastUserMessage.slice(0, 48)}…` : lastUserMessage}”`;
  }, [lastUserMessage]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-8 sm:px-6 lg:px-8">
        <header className="border-b border-slate-200 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Reference Builder</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Build your reference with Lou</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Work through each prompt in sequence to create a structured, professional reference.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void resetConversation()}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset conversation
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto py-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {completed && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p>This reference conversation is complete. You can review the thread below or start a new conversation.</p>
                  <button
                    type="button"
                    onClick={() => void resetConversation()}
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Start new conversation
                  </button>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {loading && <TypingIndicator />}

            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p>{error}</p>
                  {lastUserMessage && (
                    <button
                      type="button"
                      onClick={() => void sendMessage(lastUserMessage)}
                      disabled={loading}
                      className="inline-flex items-center justify-center rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {retryLabel}
                    </button>
                  )}
                </div>
              </div>
            )}

            {!hasHydrated && <div className="text-sm text-slate-500">Loading conversation…</div>}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 w-full bg-white/90">
        <ChatInput
          value={input}
          disabled={loading || !conversationState || completed}
          onChange={setInput}
          onSubmit={() => void sendMessage()}
        />
      </div>
    </div>
  );
}
