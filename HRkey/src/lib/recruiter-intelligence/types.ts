export type IntelligenceBand = "low" | "limited" | "moderate" | "medium" | "strong" | "high";

export type RoleDefinitionInput = {
  requiredSkills?: string[];
  preferredSkills?: string[];
  keywords?: string[];
  seniorityLevel?: string | null;
};

export type ScoreMap = Record<string, number | null | undefined>;

export type RoleFitResponse = {
  ok: true;
  candidateId: string;
  roleFitScore?: number | null;
  band?: IntelligenceBand | null;
  components?: ScoreMap | null;
  explanation?: string[] | null;
  caveats?: string[] | null;
};

export type PerformancePredictionResponse = {
  ok: true;
  candidateId: string;
  performancePredictionScore?: number | null;
  band?: IntelligenceBand | null;
  components?: ScoreMap | null;
  explanation?: string[] | null;
  caveats?: string[] | null;
  diagnostics?: {
    appliedCeilings?: Record<string, unknown>;
  } | null;
};

export type RecruiterGraphInsight = {
  type: string;
  band?: IntelligenceBand | null;
  score?: number | null;
  headline?: string | null;
  details?: string[] | null;
};

export type RecruiterGraphInsightsResponse = {
  ok: true;
  target: { entityType: string; entityId: string };
  summary?: {
    overallGraphReadiness?: IntelligenceBand | null;
    networkCredibilityBand?: IntelligenceBand | null;
    candidateInfluenceBand?: IntelligenceBand | null;
    trustedCollaboratorBand?: IntelligenceBand | null;
  } | null;
  insights?: RecruiterGraphInsight[] | null;
  supportingCounts?: {
    referenceCount?: number | null;
    canonicalRefereeCount?: number | null;
    confirmedRelationshipCount?: number | null;
    inferredRelationshipCount?: number | null;
    unresolvedReferenceCount?: number | null;
  } | null;
  caveats?: string[] | null;
};

export type ReputationTrustWeightingResponse = {
  ok: true;
  target: { entityType: string; entityId: string };
  weightedScore?: number | null;
  baseScore?: number | null;
  band?: IntelligenceBand | null;
  weights?: {
    finalCompositeWeight?: number | null;
    [key: string]: number | null | undefined;
  } | null;
  explanations?: string[] | null;
  caveats?: string[] | null;
  supportingCounts?: Record<string, number | null | undefined> | null;
};

export type ReputationPropagationResponse = {
  ok: true;
  target: { entityType: string; entityId: string };
  score?: number | null;
  confidenceBand?: IntelligenceBand | null;
  explanations?: string[] | null;
  caveats?: string[] | null;
  directEvidenceScore?: number | null;
  networkPropagationScore?: number | null;
  supportingEvidenceCount?: number | null;
  supportingCandidateCount?: number | null;
  supportingConfirmedRelationshipCount?: number | null;
};

export type CandidateReference = {
  id: string;
  owner_id?: string;
  referrer_name?: string | null;
  relationship?: string | null;
  summary?: string | null;
  overall_rating?: number | null;
  status?: string | null;
  validation_status?: string | null;
  created_at?: string | null;
};

export type CandidateReferencesResponse = {
  ok: true;
  candidateId: string;
  references?: CandidateReference[] | null;
  count?: number | null;
  accessLevel?: string | null;
};

export type ReferenceQualityResponse = {
  ok: true;
  referenceId: string;
  qualityScore?: number | null;
  band?: IntelligenceBand | null;
  dimensions?: ScoreMap | null;
  explanation?: string[] | null;
  caveats?: string[] | null;
};

export type SectionState<T> = {
  status: "idle" | "loading" | "success" | "error" | "forbidden" | "empty";
  data: T | null;
  error: string | null;
};

export type BenchmarkSummary = {
  strongestSignal: string | null;
  weakestSignal: string | null;
  comparisons: string[];
  evidenceGaps: string[];
};

export type OverallDashboardStatus = "loading" | "ready" | "partial" | "forbidden" | "empty";

export type TalentIntelligenceDashboardData = {
  candidateId: string;
  roleDefinition: RoleDefinitionInput;
  hasRoleDefinition: boolean;
  roleFit: SectionState<RoleFitResponse>;
  performance: SectionState<PerformancePredictionResponse>;
  graph: SectionState<RecruiterGraphInsightsResponse>;
  trust: SectionState<ReputationTrustWeightingResponse>;
  propagation: SectionState<ReputationPropagationResponse>;
  references: SectionState<CandidateReferencesResponse>;
  referenceQuality: SectionState<ReferenceQualityResponse[]>;
  benchmark: BenchmarkSummary;
  summaryText: string;
  topCaveats: string[];
  overallStatus: OverallDashboardStatus;
};
