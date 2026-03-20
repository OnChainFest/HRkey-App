"use client";

import {
  formatBandLabel,
  formatMetricLabel,
  formatScore,
  getBandToneClass,
  getSectionBand,
  getSafeReferenceCount,
  sanitizeInsights,
  sanitizeMetrics,
  sanitizeTextList,
} from "@/lib/recruiter-intelligence/helpers";
import type {
  ReferenceQualityResponse,
  SectionState,
  TalentIntelligenceDashboardData,
} from "@/lib/recruiter-intelligence/types";

type Props = {
  data: TalentIntelligenceDashboardData;
};

function IntelligenceStateBanner({ status, message }: { status: "warning" | "error" | "info"; message: string }) {
  const tone = status === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : status === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${tone}`}>{message}</div>;
}

function RoleDefinitionNotice() {
  return (
    <IntelligenceStateBanner
      status="info"
      message="Role-fit and forecast signals are currently shown without a recruiter-selected role profile, so they should be read as general supportive context rather than a role-specific evaluation."
    />
  );
}

function SectionShell({ title, subtitle, state, children }: { title: string; subtitle: string; state: SectionState<unknown>; children?: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        {state.status === "success" && (
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getBandToneClass(getSectionBand(state.data as never))}`}>
            {formatBandLabel(getSectionBand(state.data as never))}
          </span>
        )}
      </div>
      {state.status === "loading" && <div className="mt-4 animate-pulse rounded-2xl bg-slate-100 p-6 text-sm text-slate-500">Loading bounded recruiter intelligence…</div>}
      {state.status === "forbidden" && <div className="mt-4"><IntelligenceStateBanner status="warning" message={state.error || "This section is not available with the current permissions."} /></div>}
      {state.status === "error" && <div className="mt-4"><IntelligenceStateBanner status="warning" message={state.error || "This section could not be loaded right now."} /></div>}
      {state.status === "empty" && <div className="mt-4"><IntelligenceStateBanner status="info" message={state.error || "Evidence for this section is still limited or unavailable."} /></div>}
      {state.status === "success" && children}
    </section>
  );
}

function MetricList({ metrics, emptyCopy }: { metrics?: Record<string, number>; emptyCopy: string }) {
  const safeMetrics = sanitizeMetrics(metrics);

  if (Object.keys(safeMetrics).length === 0) {
    return <p className="text-sm text-slate-500">{emptyCopy}</p>;
  }

  return (
    <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {Object.entries(safeMetrics).map(([key, value]) => (
        <div key={key} className="rounded-2xl bg-slate-50 p-4">
          <dt className="text-sm text-slate-500">{formatMetricLabel(key)}</dt>
          <dd className="mt-1 text-lg font-semibold text-slate-900">{formatScore(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function BulletBlock({ title, items, emptyCopy }: { title: string; items?: string[] | null; emptyCopy: string }) {
  const safeItems = sanitizeTextList(items);

  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h3>
      {safeItems.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {safeItems.map((item) => <li key={item} className="flex gap-2"><span className="mt-1 text-slate-400">•</span><span>{item}</span></li>)}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{emptyCopy}</p>
      )}
    </div>
  );
}

function TalentIntelligenceSummaryCard({ data }: Props) {
  const roleBand = data.roleFit.data?.band;
  const performanceBand = data.performance.data?.band;
  const graphBand = data.graph.data?.summary?.overallGraphReadiness;

  return (
    <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-900 p-6 text-white shadow-lg">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-[0.24em] text-indigo-200">Recruiter talent intelligence</p>
          <h1 className="mt-2 text-3xl font-semibold">Candidate {String(data.candidateId || "unknown")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-200">{data.summaryText || "This dashboard keeps fit, forecast, confidence, and network context separate so each signal stays bounded and explainable."}</p>
          <p className="mt-3 text-sm text-indigo-100">Current evidence suggests these signals should be read alongside direct interviews, work samples, and permissioned reference review.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:w-[28rem]">
          {[
            { label: "Role fit", band: roleBand, score: data.roleFit.data?.roleFitScore },
            { label: "Performance forecast", band: performanceBand, score: data.performance.data?.performancePredictionScore },
            { label: "Graph readiness", band: graphBand, score: data.propagation.data?.score },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-300">{item.label}</div>
              <div className="mt-2 text-2xl font-semibold">{formatScore(item.score)}</div>
              <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getBandToneClass(item.band)}`}>
                {formatBandLabel(item.band)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RoleFitInsightCard({ state, hasRoleDefinition }: { state: TalentIntelligenceDashboardData["roleFit"]; hasRoleDefinition: boolean }) {
  return (
    <SectionShell title="Role fit" subtitle="Role-fit is shown as a supportive signal from the existing backend model. It is not a hiring recommendation." state={state}>
      {state.data && (
        <div className="mt-5 space-y-5">
          {!hasRoleDefinition && <RoleDefinitionNotice />}
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="text-sm text-slate-500">Role-fit score</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">{formatScore(state.data.roleFitScore)}</div>
          </div>
          <MetricList metrics={sanitizeMetrics(state.data.components)} emptyCopy="No role-fit component breakdown was returned." />
          <div className="grid gap-6 md:grid-cols-2">
            <BulletBlock title="Top explanations" items={state.data.explanation} emptyCopy="No specific role-fit explanations were returned." />
            <BulletBlock title="Top caveats" items={state.data.caveats} emptyCopy="No additional role-fit caveats were returned." />
          </div>
        </div>
      )}
    </SectionShell>
  );
}

function PerformancePredictionCard({ state, hasRoleDefinition }: { state: TalentIntelligenceDashboardData["performance"]; hasRoleDefinition: boolean }) {
  return (
    <SectionShell title="Performance prediction" subtitle="This forecast is bounded context only. It should not be read as certainty about future job performance." state={state}>
      {state.data && (
        <div className="mt-5 space-y-5">
          {!hasRoleDefinition && <RoleDefinitionNotice />}
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="text-sm text-slate-500">Prediction score</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">{formatScore(state.data.performancePredictionScore)}</div>
          </div>
          <MetricList metrics={sanitizeMetrics(state.data.components)} emptyCopy="No prediction component breakdown was returned." />
          <div className="grid gap-6 md:grid-cols-2">
            <BulletBlock title="Forecast notes" items={state.data.explanation} emptyCopy="No forecast notes were returned." />
            <BulletBlock title="Caveats" items={state.data.caveats} emptyCopy="No forecast caveats were returned." />
          </div>
        </div>
      )}
    </SectionShell>
  );
}

function NetworkReputationCard({ data }: Props) {
  const graphInsights = sanitizeInsights(data.graph.data?.insights);

  return (
    <SectionShell title="Network reputation and graph context" subtitle="Network credibility, trusted collaborator support, and graph-backed propagation are shown side by side to avoid overclaiming." state={data.graph}>
      {data.graph.data && (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Network credibility", band: data.graph.data.summary?.networkCredibilityBand },
              { label: "Trusted collaborators", band: data.graph.data.summary?.trustedCollaboratorBand },
              { label: "Candidate influence", band: data.graph.data.summary?.candidateInfluenceBand },
              { label: "Propagation support", band: data.propagation.data?.confidenceBand || data.graph.data.summary?.overallGraphReadiness },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm text-slate-500">{item.label}</div>
                <div className="mt-2 text-base font-semibold text-slate-900">{formatBandLabel(item.band)}</div>
              </div>
            ))}
          </div>

          {graphInsights.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {graphInsights.map((insight) => (
                <article key={insight.type} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-900">{insight.headline}</h3>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getBandToneClass(insight.band)}`}>
                      {formatBandLabel(insight.band)}
                    </span>
                  </div>
                  <BulletBlock title="Supporting details" items={insight.details} emptyCopy="No supporting graph details were returned for this insight." />
                </article>
              ))}
            </div>
          ) : (
            <IntelligenceStateBanner status="info" message="Graph insight details are limited, so only the available summary bands are shown." />
          )}

          {(data.propagation.status === "success" || data.trust.status === "success") && (
            <div className="grid gap-4 md:grid-cols-2">
              {data.propagation.status === "success" && data.propagation.data && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-sm text-slate-500">Graph-backed support score</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{formatScore(data.propagation.data.score)}</div>
                  <p className="mt-2 text-sm text-slate-600">Current evidence suggests this graph signal is best read as context, especially when propagation depth is limited.</p>
                </div>
              )}
              {data.trust.status === "success" && data.trust.data && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-sm text-slate-500">Evidence-weighting signal</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{formatScore(data.trust.data.weightedScore)}</div>
                  <p className="mt-2 text-sm text-slate-600">This reflects evidence quality weighting, not a final truth score.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}

function BenchmarkSummaryCard({ data }: Props) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Relative signal balance</h2>
          <p className="mt-1 text-sm text-slate-600">This comparison is frontend-derived from existing signals only. It does not represent population ranking or percentile placement.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-sm text-slate-500">Strongest current signal</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{data.benchmark.strongestSignal || "Unavailable"}</div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-sm text-slate-500">Weakest current signal</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{data.benchmark.weakestSignal || "Unavailable"}</div>
        </div>
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <BulletBlock title="Relative comparisons" items={data.benchmark.comparisons} emptyCopy="Comparative signal framing is unavailable until at least two signals load." />
        <BulletBlock title="Evidence gaps" items={data.benchmark.evidenceGaps} emptyCopy="No major evidence gaps were surfaced across the currently loaded signals." />
      </div>
    </section>
  );
}

function EvidenceQualityPanel({ references, quality }: { references: TalentIntelligenceDashboardData["references"]; quality: TalentIntelligenceDashboardData["referenceQuality"]; }) {
  const safeReferences = references.data?.references || [];
  const qualityData = Array.isArray(quality.data) ? quality.data : [];

  return (
    <SectionShell title="Reference evidence" subtitle="Evidence is summarized conservatively. Raw private reference text is not shown here." state={references}>
      {references.data && (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-500">Reference count</div><div className="mt-2 text-2xl font-semibold text-slate-900">{getSafeReferenceCount(references.data.count, safeReferences.length)}</div></div>
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-500">Sampled quality cards</div><div className="mt-2 text-2xl font-semibold text-slate-900">{qualityData.length}</div></div>
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-500">Access level</div><div className="mt-2 text-lg font-semibold text-slate-900">{references.data.accessLevel || "Permissioned"}</div></div>
          </div>

          {quality.status === "forbidden" && <IntelligenceStateBanner status="warning" message={quality.error || "Reference quality samples are not available."} />}
          {quality.status === "error" && <IntelligenceStateBanner status="warning" message={quality.error || "Reference quality samples could not be loaded."} />}
          {quality.status === "empty" && <IntelligenceStateBanner status="info" message="No reference quality samples were available to summarize." />}

          {quality.status === "success" && qualityData.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {qualityData.map((item: ReferenceQualityResponse) => (
                <div key={item.referenceId} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-slate-900">Reference {String(item.referenceId || "unknown")}</h3>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getBandToneClass(item.band)}`}>{formatBandLabel(item.band)}</span>
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-slate-900">{formatScore(item.qualityScore)}</div>
                  <p className="mt-2 text-sm text-slate-600">Evidence quality appears uneven when sample bands differ, so this panel should be read conservatively.</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}

export default function TalentIntelligenceDashboard({ data }: Props) {
  if (data.overallStatus === "forbidden") {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <IntelligenceStateBanner status="error" message="You do not have access to this recruiter intelligence dashboard. Permissioned candidate access is required." />
      </div>
    );
  }

  if (data.overallStatus === "empty") {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Recruiter intelligence is not available yet</h1>
          <p className="mt-3 text-sm text-slate-600">This candidate does not currently expose enough permissioned intelligence data to build the dashboard.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <TalentIntelligenceSummaryCard data={data} />

      {!data.hasRoleDefinition && <RoleDefinitionNotice />}

      {data.overallStatus === "partial" && (
        <IntelligenceStateBanner status="warning" message="Some recruiter intelligence sections are unavailable right now. Available sections remain usable and are shown below." />
      )}

      {sanitizeTextList(data.topCaveats).length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Top caveats and trust notes</h2>
          <p className="mt-1 text-sm text-slate-600">These caveats are intentionally prominent so sparse or uneven evidence is easy to spot.</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {sanitizeTextList(data.topCaveats).map((item) => <li key={item} className="flex gap-2"><span className="mt-1 text-slate-400">•</span><span>{item}</span></li>)}
          </ul>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <RoleFitInsightCard state={data.roleFit} hasRoleDefinition={data.hasRoleDefinition} />
        <PerformancePredictionCard state={data.performance} hasRoleDefinition={data.hasRoleDefinition} />
      </div>

      <NetworkReputationCard data={data} />
      <BenchmarkSummaryCard data={data} />
      <EvidenceQualityPanel references={data.references} quality={data.referenceQuality} />
    </div>
  );
}
