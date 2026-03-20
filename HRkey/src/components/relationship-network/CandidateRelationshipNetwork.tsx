export type RelationshipStatus = "confirmed" | "inferred" | "referenced";

export type RelationshipEvidence = {
  referenceId: string;
  relationshipLabel: string;
  relationshipType: string;
  status: string | null;
  createdAt: string | null;
  sourceType: "signal" | "reference";
};

export type CanonicalRelationshipNode = {
  refereeId: string;
  displayName: string;
  relationshipLabel: string;
  relationshipType: string;
  relationshipStatus: RelationshipStatus;
  supportingReferenceCount: number;
  evidenceCount: number;
  confirmedRelationshipTypes: string[];
  inferredRelationshipTypes: string[];
  evidence: RelationshipEvidence[];
  resolutionConfidence: string | null;
  evidenceHint: string;
};

export type UnresolvedRelationshipEvidence = {
  referenceId: string;
  label: string;
  relationshipLabel: string;
  relationshipType: string;
  createdAt: string | null;
  sourceType: "signal-only" | "referenced";
};

export type CandidateRelationshipVisualizationData = {
  candidate: {
    id: string;
    label: string;
    headline: string | null;
  };
  summary: {
    refereeCount: number;
    referenceCount: number;
    unresolvedReferenceCount: number;
    distinctRelationshipTypeCount: number;
    confirmedRelationshipCount: number;
    inferredRelationshipCount: number;
    networkStrengthBand: "low" | "medium" | "high";
    evidenceCoverage: "limited" | "moderate" | "strong";
  };
  relationships: CanonicalRelationshipNode[];
  unresolvedEvidence: UnresolvedRelationshipEvidence[];
};

type Props = {
  data?: CandidateRelationshipVisualizationData | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
};

const badgeStyles: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inferred: "bg-amber-50 text-amber-700 border-amber-200",
  referenced: "bg-slate-100 text-slate-700 border-slate-200",
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-indigo-50 text-indigo-700 border-indigo-200",
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  limited: "bg-slate-100 text-slate-700 border-slate-200",
  moderate: "bg-amber-50 text-amber-700 border-amber-200",
  strong: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const statLabels = [
  { key: "refereeCount", label: "Canonical referees" },
  { key: "referenceCount", label: "Total references" },
  { key: "distinctRelationshipTypeCount", label: "Relationship types" },
  { key: "confirmedRelationshipCount", label: "Confirmed ties" },
] as const;

function toneLabel(status: RelationshipStatus) {
  if (status === "confirmed") return "Confirmed graph relationship";
  if (status === "inferred") return "Inferred from reference evidence";
  return "Referenced / unknown";
}

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CandidateRelationshipNetwork({ data, loading = false, error = null, onRefresh }: Props) {
  const hasRelationships = (data?.relationships?.length || 0) > 0;
  const hasEvidence = (data?.unresolvedEvidence?.length || 0) > 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Professional Relationship Network</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Candidate-centered view of canonical referees, confirmed graph relationships, and reference-derived signals.
          </p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Refresh
          </button>
        )}
      </div>

      {loading && <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">Loading relationship network…</div>}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {statLabels.map(({ key, label }) => (
              <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm text-slate-500">{label}</div>
                <div className="mt-2 text-3xl font-semibold text-slate-900">{data.summary[key]}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${badgeStyles[data.summary.networkStrengthBand]}`}>
              Network strength: {data.summary.networkStrengthBand}
            </span>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${badgeStyles[data.summary.evidenceCoverage]}`}>
              Evidence coverage: {data.summary.evidenceCoverage}
            </span>
            {data.summary.unresolvedReferenceCount > 0 && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {data.summary.unresolvedReferenceCount} unresolved reference{data.summary.unresolvedReferenceCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <section className="rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-6 shadow-sm">
            <div className="flex flex-col items-center gap-4">
              <div className="flex max-w-sm flex-col items-center rounded-2xl border border-indigo-200 bg-indigo-50 px-6 py-5 text-center shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Candidate</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{data.candidate.label}</div>
                <div className="mt-1 text-sm text-slate-600">{data.candidate.headline || "Professional relationship focal point"}</div>
              </div>

              {hasRelationships ? (
                <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.relationships.map((relationship) => (
                    <article key={relationship.refereeId} className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="pointer-events-none absolute left-1/2 top-0 hidden h-10 w-px -translate-y-full bg-slate-300 md:block" />
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900">{relationship.displayName}</h2>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeStyles[relationship.relationshipStatus]}`}>
                          {toneLabel(relationship.relationshipStatus)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-medium text-slate-900">{relationship.relationshipLabel}</p>
                      <p className="mt-1 text-sm text-slate-600">{relationship.evidenceHint}</p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{relationship.supportingReferenceCount} reference{relationship.supportingReferenceCount === 1 ? "" : "s"}</span>
                        {relationship.confirmedRelationshipTypes.length > 0 && (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Confirmed: {relationship.confirmedRelationshipTypes.join(", ")}</span>
                        )}
                        {relationship.confirmedRelationshipTypes.length === 0 && relationship.inferredRelationshipTypes.length > 0 && (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">Signal: {relationship.inferredRelationshipTypes.join(", ")}</span>
                        )}
                      </div>

                      <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting evidence</div>
                        {relationship.evidence.map((evidence) => (
                          <div key={evidence.referenceId} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span>{evidence.relationshipLabel}</span>
                              <span className="text-xs text-slate-500">{formatDate(evidence.createdAt)}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {evidence.sourceType === "signal" ? "Reference-derived relationship signal" : "Reference evidence only"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="w-full rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900">This network is still growing</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Canonical referee matching and verified reference submissions will make the professional relationship network richer over time.
                  </p>
                </div>
              )}
            </div>
          </section>

          {hasEvidence && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Reference evidence awaiting canonical matching</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    These records are supporting evidence. They are shown separately until a canonical referee identity is available.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {data.unresolvedEvidence.map((item) => (
                  <div key={item.referenceId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-slate-900">{item.label}</div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">{item.sourceType === "signal-only" ? "Signal only" : "Referenced"}</span>
                    </div>
                    <div className="mt-2 text-sm text-slate-700">{item.relationshipLabel}</div>
                    <div className="mt-1 text-xs text-slate-500">Evidence captured on {formatDate(item.createdAt)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
