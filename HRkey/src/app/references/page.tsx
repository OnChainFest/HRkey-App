"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ReferenceStrikethrough } from "@/components/ReferenceStrikethrough";

/**
 * Reference status types for FASE 1 candidate review workflow
 */
type ReferenceStatus = "active" | "SUBMITTED" | "REVISION_REQUESTED" | "ACCEPTED" | "OMITTED";

type Reference = {
  id: string;
  referrer_name: string | null;
  relationship: string | null;
  summary: string | null;
  overall_rating: number | null;
  status: ReferenceStatus;
  validation_status: string | null;
  is_hidden: boolean;
  hidden_at: string | null;
  reference_type: string | null;
  created_at: string;
  accepted_at: string | null;
  revision_requested_at: string | null;
  revision_count: number | null;
};

type StatusCounts = {
  submitted: number;
  revision_requested: number;
  accepted: number;
  omitted: number;
  active: number;
};

type ApiResponse = {
  ok: boolean;
  references: Reference[];
  count: number;
  statusCounts: StatusCounts;
};

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: ReferenceStatus }) {
  const configs: Record<ReferenceStatus, { label: string; className: string }> = {
    SUBMITTED: {
      label: "Pending Review",
      className: "bg-amber-100 text-amber-800 border-amber-200",
    },
    REVISION_REQUESTED: {
      label: "Revision Requested",
      className: "bg-purple-100 text-purple-800 border-purple-200",
    },
    ACCEPTED: {
      label: "Accepted",
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    OMITTED: {
      label: "Omitted",
      className: "bg-slate-100 text-slate-500 border-slate-200",
    },
    active: {
      label: "Active (Legacy)",
      className: "bg-blue-100 text-blue-800 border-blue-200",
    },
  };

  const config = configs[status] || configs.active;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}
    >
      {config.label}
    </span>
  );
}

/**
 * Rating stars display
 */
function RatingStars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-slate-400">-</span>;

  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;

  return (
    <div className="flex items-center gap-0.5">
      {[...Array(5)].map((_, i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${
            i < fullStars
              ? "text-amber-400 fill-current"
              : i === fullStars && hasHalf
              ? "text-amber-400"
              : "text-slate-300"
          }`}
          viewBox="0 0 20 20"
          fill={i < fullStars || (i === fullStars && hasHalf) ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1}
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1 text-sm text-slate-600">{rating.toFixed(1)}</span>
    </div>
  );
}

/**
 * Action button for reference review
 */
function ActionButton({
  onClick,
  disabled,
  loading,
  variant,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant: "accept" | "revision" | "omit";
  children: React.ReactNode;
}) {
  const variants = {
    accept: "bg-emerald-600 hover:bg-emerald-700 text-white",
    revision: "bg-purple-600 hover:bg-purple-700 text-white",
    omit: "bg-slate-600 hover:bg-slate-700 text-white",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]}`}
    >
      {loading ? (
        <span className="flex items-center gap-1">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Processing...
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Reference card component
 */
function ReferenceCard({
  reference,
  onAccept,
  onRequestRevision,
  onOmit,
  actionLoading,
}: {
  reference: Reference;
  onAccept: (id: string) => void;
  onRequestRevision: (id: string) => void;
  onOmit: (id: string) => void;
  actionLoading: string | null;
}) {
  const isLoading = actionLoading === reference.id;
  const canReview = reference.status === "SUBMITTED" || reference.status === "active";
  const isRevisionRequested = reference.status === "REVISION_REQUESTED";
  const isOmitted = reference.status === "OMITTED";

  // Show strikethrough component for omitted references
  if (isOmitted && reference.hidden_at) {
    return (
      <ReferenceStrikethrough
        referenceId={reference.id}
        referenceType={reference.reference_type || "general"}
        hiddenAt={reference.hidden_at}
        createdAt={reference.created_at}
        className="mb-4"
      />
    );
  }

  return (
    <div
      className={`border rounded-lg p-4 bg-white shadow-sm ${
        canReview ? "border-amber-200 bg-amber-50/30" : "border-slate-200"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-900">
            {reference.referrer_name || "Anonymous"}
          </h3>
          <p className="text-sm text-slate-600 capitalize">
            {reference.relationship || "Colleague"}
          </p>
        </div>
        <StatusBadge status={reference.status} />
      </div>

      {/* Rating */}
      <div className="mb-3">
        <RatingStars rating={reference.overall_rating} />
      </div>

      {/* Summary preview */}
      {reference.summary && (
        <p className="text-sm text-slate-700 mb-3 line-clamp-2">{reference.summary}</p>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
        <span>
          Created: {new Date(reference.created_at).toLocaleDateString()}
        </span>
        {reference.accepted_at && (
          <span>
            Accepted: {new Date(reference.accepted_at).toLocaleDateString()}
          </span>
        )}
        {reference.revision_count ? (
          <span>Revisions: {reference.revision_count}</span>
        ) : null}
      </div>

      {/* Action buttons for pending review */}
      {(canReview || isRevisionRequested) && (
        <div className="flex items-center gap-2 pt-3 border-t border-slate-200">
          {canReview && (
            <>
              <ActionButton
                variant="accept"
                onClick={() => onAccept(reference.id)}
                loading={isLoading}
                disabled={isLoading}
              >
                Accept
              </ActionButton>
              <ActionButton
                variant="revision"
                onClick={() => onRequestRevision(reference.id)}
                loading={isLoading}
                disabled={isLoading}
              >
                Request Revision
              </ActionButton>
            </>
          )}
          <ActionButton
            variant="omit"
            onClick={() => onOmit(reference.id)}
            loading={isLoading}
            disabled={isLoading}
          >
            Omit
          </ActionButton>
        </div>
      )}

      {/* Revision requested notice */}
      {isRevisionRequested && (
        <div className="mt-3 p-2 bg-purple-50 rounded text-sm text-purple-700">
          You have requested a revision for this reference. The referee will be
          notified.
          {/* TODO: Later phase - show revision request reason and referee response */}
        </div>
      )}
    </div>
  );
}

/**
 * Filter tabs component
 */
function FilterTabs({
  activeFilter,
  onFilterChange,
  counts,
}: {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  counts: StatusCounts;
}) {
  const tabs = [
    { id: "all", label: "All", count: null },
    { id: "pending", label: "Pending Review", count: counts.submitted + counts.active },
    { id: "revision", label: "Revision Requested", count: counts.revision_requested },
    { id: "accepted", label: "Accepted", count: counts.accepted },
    { id: "omitted", label: "Omitted", count: counts.omitted },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onFilterChange(tab.id)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeFilter === tab.id
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {tab.label}
          {tab.count !== null && tab.count > 0 && (
            <span
              className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                activeFilter === tab.id
                  ? "bg-white/20"
                  : "bg-slate-200"
              }`}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Main References Page
 * FASE 1: Candidate controls references before they become usable
 */
export default function ReferencesPage() {
  const [references, setReferences] = useState<Reference[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({
    submitted: 0,
    revision_requested: 0,
    accepted: 0,
    omitted: 0,
    active: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");

  // Fetch references
  const fetchReferences = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      // Get session for auth
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError("Please sign in to view your references");
        return;
      }

      // Build query params based on filter
      const params = new URLSearchParams();
      if (activeFilter === "omitted") {
        params.set("includeOmitted", "true");
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/api/references/me?${params}`,
        {
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch references");
      }

      const data: ApiResponse = await response.json();

      if (data.ok) {
        setReferences(data.references);
        setStatusCounts(data.statusCounts);
      } else {
        throw new Error("Failed to load references");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchReferences();
  }, [fetchReferences]);

  // Action handlers
  const handleAction = async (
    referenceId: string,
    action: "accept" | "request-revision" | "omit"
  ) => {
    try {
      setActionLoading(referenceId);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError("Please sign in");
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/api/references/${referenceId}/${action}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || `Failed to ${action} reference`);
      }

      // Refresh the list
      await fetchReferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Filter references based on active tab
  const filteredReferences = references.filter((ref) => {
    switch (activeFilter) {
      case "pending":
        return ref.status === "SUBMITTED" || ref.status === "active";
      case "revision":
        return ref.status === "REVISION_REQUESTED";
      case "accepted":
        return ref.status === "ACCEPTED";
      case "omitted":
        return ref.status === "OMITTED";
      default:
        return true;
    }
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">My References</h1>
        <p className="text-slate-600">
          Review and manage references from your professional network. Only
          accepted references are visible to employers.
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <FilterTabs
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        counts={statusCounts}
      />

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <svg
            className="animate-spin h-8 w-8 text-slate-400"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredReferences.length === 0 && (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <svg
            className="mx-auto h-12 w-12 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-slate-900">
            No references found
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {activeFilter === "all"
              ? "Request references from your professional contacts to get started."
              : `No references with "${activeFilter}" status.`}
          </p>
        </div>
      )}

      {/* References list */}
      {!loading && filteredReferences.length > 0 && (
        <div className="space-y-4">
          {filteredReferences.map((reference) => (
            <ReferenceCard
              key={reference.id}
              reference={reference}
              onAccept={(id) => handleAction(id, "accept")}
              onRequestRevision={(id) => handleAction(id, "request-revision")}
              onOmit={(id) => handleAction(id, "omit")}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}

      {/* Info banner */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-1">
          How candidate reference review works
        </h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>
            <strong>Accept:</strong> Mark a reference as verified and make it visible
            to employers
          </li>
          <li>
            <strong>Request Revision:</strong> Ask the referee to update their
            reference
          </li>
          <li>
            <strong>Omit:</strong> Hide a reference with a visible strikethrough
            (cannot be undone - demonstrates professional growth)
          </li>
        </ul>
      </div>
    </div>
  );
}
