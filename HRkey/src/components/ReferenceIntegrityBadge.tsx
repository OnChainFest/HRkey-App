"use client";

/**
 * ReferenceIntegrityBadge Component
 *
 * Displays the on-chain integrity status of a reference.
 *
 * Philosophy:
 * - Tattoo is immutable and forever (like a real tattoo)
 * - VALID = content matches on-chain hash
 * - INVALID = content changed after tattoo (hash mismatch)
 * - UNKNOWN = not yet tattooed
 */

type IntegrityStatus = "VALID" | "INVALID" | "UNKNOWN";

type ReferenceIntegrityBadgeProps = {
  status: IntegrityStatus;
  txHash?: string | null;
  chainId?: number | null;
  tattooedAt?: string | null;
  compact?: boolean;
  className?: string;
};

export function ReferenceIntegrityBadge({
  status,
  txHash,
  chainId,
  tattooedAt,
  compact = false,
  className = "",
}: ReferenceIntegrityBadgeProps) {
  const getExplorerUrl = (hash: string, chain: number) => {
    // Base Sepolia
    if (chain === 84532) {
      return `https://sepolia.basescan.org/tx/${hash}`;
    }
    // Base Mainnet
    if (chain === 8453) {
      return `https://basescan.org/tx/${hash}`;
    }
    // Default to Base Sepolia
    return `https://sepolia.basescan.org/tx/${hash}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  if (status === "UNKNOWN") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ${className}`}
        title="This reference has not been verified on-chain yet"
      >
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {!compact && "Not tattooed"}
      </span>
    );
  }

  if (status === "VALID") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 ${className}`}
        title={`Verified on-chain${tattooedAt ? ` on ${formatDate(tattooedAt)}` : ""}`}
      >
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        {!compact && "Verified"}
        {txHash && chainId && (
          <a
            href={getExplorerUrl(txHash, chainId)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 text-emerald-800 underline hover:text-emerald-900"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="h-3 w-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        )}
      </span>
    );
  }

  // INVALID
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 ${className}`}
      title="Reference content has changed since it was tattooed - integrity check failed"
    >
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      {!compact && "Modified"}
      {txHash && chainId && (
        <a
          href={getExplorerUrl(txHash, chainId)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 text-red-800 underline hover:text-red-900"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="h-3 w-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      )}
    </span>
  );
}

export default ReferenceIntegrityBadge;
