"use client";

/**
 * ReferenceStrikethrough Component
 *
 * Displays a visible strikethrough placeholder for hidden references.
 *
 * Design Philosophy:
 * - Hidden ≠ erased
 * - The strikethrough must remain visible forever
 * - Content behind the strikethrough must not be inferable
 * - Strikethrough is intentional, permanent, and meaningful
 * - Tone: neutral, non-punitive, non-shaming
 */

type ReferenceStrikethroughProps = {
  referenceId: string;
  referenceType?: string;
  hiddenAt: string;
  createdAt: string;
  isReplacement?: boolean;
  wasReplaced?: boolean;
  className?: string;
};

export function ReferenceStrikethrough({
  referenceId,
  referenceType = "general",
  hiddenAt,
  createdAt,
  isReplacement = false,
  wasReplaced = false,
  className = "",
}: ReferenceStrikethroughProps) {
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
      });
    } catch {
      return dateStr;
    }
  };

  const typeLabels: Record<string, string> = {
    general: "Reference",
    manager: "Manager reference",
    peer: "Peer reference",
    direct_report: "Direct report reference",
    client: "Client reference",
    mentor: "Mentor reference",
    other: "Reference",
  };

  const label = typeLabels[referenceType] || "Reference";

  return (
    <div
      className={`relative rounded-lg border border-slate-300 bg-slate-50 p-5 ${className}`}
      data-reference-id={referenceId}
    >
      {/* Visual strikethrough indicator */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-full h-0.5 bg-slate-400 opacity-50" />
      </div>

      {/* Content */}
      <div className="relative space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                </svg>
                Hidden
              </span>
              <span className="text-xs text-slate-500">{label}</span>
            </div>
            <p className="text-sm text-slate-600">
              This reference was hidden by the candidate
            </p>
          </div>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
          <div>
            <span className="font-medium text-slate-700">Originally created</span>
            <div>{formatDate(createdAt)}</div>
          </div>
          <div>
            <span className="font-medium text-slate-700">Hidden on</span>
            <div>{formatDate(hiddenAt)}</div>
          </div>
        </div>

        {/* Evolution signals */}
        {(isReplacement || wasReplaced) && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            {isReplacement && (
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="font-medium">
                  This reference replaces a previous one
                </span>
              </div>
            )}
            {wasReplaced && (
              <div className="flex items-center gap-2 text-xs text-blue-700">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
                <span className="font-medium">
                  A newer reference is available
                </span>
              </div>
            )}
          </div>
        )}

        {/* Philosophy statement */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500 italic">
            This placeholder demonstrates professional evolution. Hiding a reference
            does not erase it from the record—it signals growth and accountability.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ReferenceStrikethrough;
