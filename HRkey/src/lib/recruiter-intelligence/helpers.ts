import type {
  BenchmarkSummary,
  IntelligenceBand,
  RecruiterGraphInsight,
  RecruiterGraphInsightsResponse,
  RoleDefinitionInput,
  RoleFitResponse,
  PerformancePredictionResponse,
  ReputationPropagationResponse,
  ReputationTrustWeightingResponse,
  ScoreMap,
  SectionState,
  TalentIntelligenceDashboardData,
} from "./types";

const bandLabels: Record<string, string> = {
  low: "Low",
  limited: "Limited",
  moderate: "Moderate",
  medium: "Medium",
  strong: "Strong",
  high: "High",
};

export const formatBandLabel = (band?: string | null) => {
  if (!band) return "Unavailable";
  return bandLabels[band] || band.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

export const bandToneClass: Record<string, string> = {
  low: "border-slate-200 bg-slate-100 text-slate-700",
  limited: "border-slate-200 bg-slate-100 text-slate-700",
  moderate: "border-amber-200 bg-amber-50 text-amber-700",
  medium: "border-indigo-200 bg-indigo-50 text-indigo-700",
  strong: "border-emerald-200 bg-emerald-50 text-emerald-700",
  high: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export const getBandToneClass = (band?: string | null) => bandToneClass[band || ""] || bandToneClass.limited;

export const formatScore = (score?: number | null) => {
  if (typeof score !== "number" || Number.isNaN(score)) return "—";
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
};

export const formatMetricLabel = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const sanitizeTextList = (items?: string[] | null) =>
  (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);

export const sanitizeMetrics = (metrics?: ScoreMap | null) =>
  Object.entries(metrics || {}).reduce<Record<string, number>>((acc, [key, value]) => {
    if (!key) return acc;
    if (typeof value !== "number" || Number.isNaN(value)) return acc;
    acc[key] = value;
    return acc;
  }, {});

export const sanitizeInsights = (insights?: RecruiterGraphInsight[] | null) =>
  (Array.isArray(insights) ? insights : []).map((insight, index) => ({
    type: insight.type || `insight-${index}`,
    band: insight.band || "limited",
    score: typeof insight.score === "number" && !Number.isNaN(insight.score) ? insight.score : undefined,
    headline: String(insight.headline || "Graph-backed context is limited for this signal.").trim(),
    details: sanitizeTextList(insight.details),
  }));

export const getSafeReferenceCount = (count?: number | null, fallbackLength = 0) => {
  if (typeof count === "number" && !Number.isNaN(count) && count >= 0) return count;
  return fallbackLength;
};

export const hasSelectedRoleDefinition = (roleDefinition?: RoleDefinitionInput | null) => {
  if (!roleDefinition) return false;
  const hasSkills = [roleDefinition.requiredSkills, roleDefinition.preferredSkills, roleDefinition.keywords]
    .some((items) => (items || []).some((item) => String(item || "").trim().length > 0));
  const hasSeniority = typeof roleDefinition.seniorityLevel === "string" && roleDefinition.seniorityLevel.trim().length > 0;
  return hasSkills || hasSeniority;
};

const collectSignalEntries = (
  roleFit: SectionState<RoleFitResponse>,
  performance: SectionState<PerformancePredictionResponse>,
  graph: SectionState<RecruiterGraphInsightsResponse>,
  trust: SectionState<ReputationTrustWeightingResponse>,
  propagation: SectionState<ReputationPropagationResponse>
) => {
  const entries = [] as { label: string; score: number }[];

  if (typeof roleFit.data?.roleFitScore === "number") entries.push({ label: "Role fit", score: roleFit.data.roleFitScore });
  if (typeof performance.data?.performancePredictionScore === "number") entries.push({ label: "Performance forecast", score: performance.data.performancePredictionScore });

  const networkScore = sanitizeInsights(graph.data?.insights).find((item) => item.type === "network_credibility")?.score;
  if (typeof networkScore === "number") entries.push({ label: "Network credibility", score: networkScore });

  if (typeof trust.data?.weightedScore === "number") {
    entries.push({ label: "Evidence quality", score: trust.data.weightedScore });
  } else if (typeof trust.data?.weights?.finalCompositeWeight === "number") {
    entries.push({ label: "Evidence quality", score: Math.max(0, Math.min(1, trust.data.weights.finalCompositeWeight / 1.35)) });
  }

  if (typeof propagation.data?.score === "number") entries.push({ label: "Graph-backed support", score: propagation.data.score });

  return entries.sort((a, b) => b.score - a.score);
};

export const buildBenchmarkSummary = (
  roleFit: SectionState<RoleFitResponse>,
  performance: SectionState<PerformancePredictionResponse>,
  graph: SectionState<RecruiterGraphInsightsResponse>,
  trust: SectionState<ReputationTrustWeightingResponse>,
  propagation: SectionState<ReputationPropagationResponse>
): BenchmarkSummary => {
  const ranked = collectSignalEntries(roleFit, performance, graph, trust, propagation);
  const strongestSignal = ranked[0]?.label || null;
  const weakestSignal = ranked.length >= 2 ? ranked[ranked.length - 1]?.label || null : null;
  const comparisons: string[] = [];
  const evidenceGaps: string[] = [];

  if (ranked.length >= 2 && strongestSignal && weakestSignal && strongestSignal !== weakestSignal) {
    comparisons.push(`${strongestSignal} is currently stronger than ${weakestSignal}.`);
  }

  if (typeof roleFit.data?.roleFitScore === "number" && typeof performance.data?.performancePredictionScore === "number") {
    if (roleFit.data.roleFitScore > performance.data.performancePredictionScore + 0.08) {
      comparisons.push("Current role readiness appears stronger than the bounded performance forecast.");
    } else if (performance.data.performancePredictionScore > roleFit.data.roleFitScore + 0.08) {
      comparisons.push("The bounded performance forecast currently reads stronger than direct role-fit alignment.");
    }
  }

  const graphCredibilityScore = sanitizeInsights(graph.data?.insights).find((item) => item.type === "network_credibility")?.score;
  if (typeof graphCredibilityScore === "number" && typeof propagation.data?.score === "number" && propagation.data.score + 0.08 < graphCredibilityScore) {
    comparisons.push("Network credibility looks stronger than graph-backed propagation depth, so read network support as still developing.");
  }

  const unresolvedReferenceCount = graph.data?.supportingCounts?.unresolvedReferenceCount;
  if (typeof unresolvedReferenceCount === "number" && unresolvedReferenceCount > 0) {
    evidenceGaps.push(`${unresolvedReferenceCount} reference signal${unresolvedReferenceCount === 1 ? " is" : "s are"} still unresolved in the graph.`);
  }

  const trustCaveat = sanitizeTextList(trust.data?.caveats)[0];
  if (trustCaveat) evidenceGaps.push(trustCaveat);

  if (ranked.length < 2) {
    evidenceGaps.push("At least two stable signals are needed before relative comparisons become meaningful.");
  }

  return { strongestSignal, weakestSignal, comparisons, evidenceGaps };
};

export const buildSummaryText = (
  data: Pick<TalentIntelligenceDashboardData, "roleFit" | "performance" | "graph" | "benchmark" | "hasRoleDefinition">
) => {
  const parts: string[] = [];

  if (!data.hasRoleDefinition) {
    parts.push("Role-fit and forecast signals are currently shown without a recruiter-selected role profile.");
  }

  if (typeof data.roleFit.data?.roleFitScore === "number") {
    parts.push(`Role fit is ${formatBandLabel(data.roleFit.data.band).toLowerCase()} based on currently available evidence.`);
  }
  if (typeof data.performance.data?.performancePredictionScore === "number") {
    parts.push("Performance prediction remains a bounded forecast and should be read alongside direct evaluation.");
  }
  if (data.graph.data) {
    parts.push("Network context is shown separately so recruiter decisions are not collapsed into a single score.");
  }
  if (data.benchmark.strongestSignal && data.benchmark.weakestSignal && data.benchmark.strongestSignal !== data.benchmark.weakestSignal) {
    parts.push(`${data.benchmark.strongestSignal} is the strongest current signal, while ${data.benchmark.weakestSignal.toLowerCase()} needs more support.`);
  }
  if (parts.length === 0) {
    parts.push("Recruiter intelligence is available only where permissioned evidence exists, and unavailable sections remain intentionally blank rather than inferred.");
  }

  return parts.join(" ");
};

export const collectTopCaveats = (
  roleFit: SectionState<RoleFitResponse>,
  performance: SectionState<PerformancePredictionResponse>,
  graph: SectionState<RecruiterGraphInsightsResponse>,
  trust: SectionState<ReputationTrustWeightingResponse>,
  propagation: SectionState<ReputationPropagationResponse>
) => {
  return Array.from(
    new Set([
      ...sanitizeTextList(roleFit.data?.caveats),
      ...sanitizeTextList(performance.data?.caveats),
      ...sanitizeTextList(graph.data?.caveats),
      ...sanitizeTextList(trust.data?.caveats),
      ...sanitizeTextList(propagation.data?.caveats),
    ])
  ).slice(0, 5);
};

export const getSectionBand = (
  data:
    | RoleFitResponse
    | PerformancePredictionResponse
    | RecruiterGraphInsightsResponse
    | ReputationTrustWeightingResponse
    | ReputationPropagationResponse
    | null
    | undefined,
  fallback?: IntelligenceBand
) => {
  if (!data) return fallback || "limited";
  if ("band" in data && data.band) return data.band as IntelligenceBand;
  if ("summary" in data && data.summary?.overallGraphReadiness) return data.summary.overallGraphReadiness;
  if ("confidenceBand" in data && data.confidenceBand) return data.confidenceBand;
  return fallback || "limited";
};
