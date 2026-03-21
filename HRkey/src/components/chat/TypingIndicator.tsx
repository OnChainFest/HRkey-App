export default function TypingIndicator() {
  return (
    <div className="flex w-full justify-start">
      <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-700">Lou is thinking</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
          </span>
        </div>
      </div>
    </div>
  );
}
