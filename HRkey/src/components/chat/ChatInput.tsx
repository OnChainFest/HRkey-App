import { FormEvent, KeyboardEvent } from "react";

type ChatInputProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export default function ChatInput({ value, disabled = false, onChange, onSubmit }: ChatInputProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-4xl items-end gap-3 rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <label htmlFor="lou-chat-input" className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
            Your response
          </label>
          <textarea
            id="lou-chat-input"
            rows={1}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Continue the conversation with Lou"
            className="max-h-40 min-h-[28px] w-full resize-none border-0 bg-transparent text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          Send
        </button>
      </div>
    </form>
  );
}
