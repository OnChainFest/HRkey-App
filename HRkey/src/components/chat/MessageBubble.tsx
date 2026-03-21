import type { ReactNode } from "react";

export type ChatRole = "user" | "lou";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type MessageBubbleProps = {
  message: ChatMessage;
  footer?: ReactNode;
};

export default function MessageBubble({ message, footer }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] space-y-2 sm:max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={[
            "rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
            isUser ? "rounded-br-md bg-slate-900 text-white" : "rounded-bl-md border border-slate-200 bg-slate-100 text-slate-900",
          ].join(" ")}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        {footer}
      </div>
    </div>
  );
}
