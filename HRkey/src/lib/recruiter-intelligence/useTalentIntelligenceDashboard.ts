"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiClientError, apiGet } from "@/lib/apiClient";
import { buildBenchmarkSummary, buildSummaryText, collectTopCaveats, hasSelectedRoleDefinition } from "./helpers";
import type {
  CandidateReferencesResponse,
  OverallDashboardStatus,
  PerformancePredictionResponse,
  ReferenceQualityResponse,
  RecruiterGraphInsightsResponse,
  ReputationPropagationResponse,
  ReputationTrustWeightingResponse,
  RoleDefinitionInput,
  RoleFitResponse,
  SectionState,
  TalentIntelligenceDashboardData,
} from "./types";

const defaultRoleDefinition: RoleDefinitionInput = {};

const createLoadingState = <T,>(): SectionState<T> => ({ status: "loading", data: null, error: null });

const mapErrorState = <T,>(error: unknown): SectionState<T> => {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.status === 403) {
      return { status: "forbidden", data: null, error: "Access to this recruiter intelligence view is restricted." };
    }
    if (error.status === 404) {
      return { status: "empty", data: null, error: "No recruiter intelligence data is available for this candidate yet." };
    }
    return { status: "error", data: null, error: error.message || "Unable to load this section right now." };
  }
  return { status: "error", data: null, error: "Unexpected error loading this section." };
};

async function fetchSection<T>(path: string, query?: Record<string, string>) {
  try {
    const data = await apiGet<T>(path, query ? { query } : undefined);
    return { status: "success", data, error: null } as SectionState<T>;
  } catch (error) {
    return mapErrorState<T>(error);
  }
}

/**
 * Major sections drive overall page truthfulness because they map to the primary recruiter cards.
 * Secondary sections (trust, propagation, sampled reference quality) can fail without making the
 * entire page non-usable, but they should still surface local warnings.
 */
const majorSectionKeys = ["roleFit", "performance", "graph", "references"] as const;

type MajorSectionKey = (typeof majorSectionKeys)[number];

type DashboardSections = Pick<
  TalentIntelligenceDashboardData,
  "roleFit" | "performance" | "graph" | "trust" | "propagation" | "references" | "referenceQuality"
>;

function resolveOverallStatus(sections: DashboardSections): OverallDashboardStatus {
  const majorSections: SectionState<unknown>[] = majorSectionKeys.map((key: MajorSectionKey) => sections[key]);
  const majorStatuses = majorSections.map((section) => section.status);

  if (majorStatuses.every((status) => status === "loading" || status === "idle")) return "loading";

  const majorSuccessCount = majorStatuses.filter((status) => status === "success").length;
  const majorForbiddenCount = majorStatuses.filter((status) => status === "forbidden").length;
  const majorEmptyCount = majorStatuses.filter((status) => status === "empty").length;
  const majorIssueCount = majorStatuses.filter((status) => status === "error" || status === "forbidden" || status === "empty").length;

  if (majorForbiddenCount === majorSections.length) return "forbidden";
  if (majorSuccessCount === 0 && majorEmptyCount === majorSections.length) return "empty";
  if (majorIssueCount === 0) return "ready";
  if (majorSuccessCount === 0 && majorForbiddenCount > 0 && majorEmptyCount + majorForbiddenCount === majorSections.length) return "partial";
  return "partial";
}

export function useTalentIntelligenceDashboard(candidateId: string, roleDefinition: RoleDefinitionInput = defaultRoleDefinition) {
  const hasRoleDefinition = useMemo(() => hasSelectedRoleDefinition(roleDefinition), [roleDefinition]);
  const [state, setState] = useState<TalentIntelligenceDashboardData>({
    candidateId,
    roleDefinition,
    hasRoleDefinition,
    roleFit: createLoadingState<RoleFitResponse>(),
    performance: createLoadingState<PerformancePredictionResponse>(),
    graph: createLoadingState<RecruiterGraphInsightsResponse>(),
    trust: createLoadingState<ReputationTrustWeightingResponse>(),
    propagation: createLoadingState<ReputationPropagationResponse>(),
    references: createLoadingState<CandidateReferencesResponse>(),
    referenceQuality: createLoadingState<ReferenceQualityResponse[]>(),
    benchmark: { strongestSignal: null, weakestSignal: null, comparisons: [], evidenceGaps: [] },
    summaryText: "",
    topCaveats: [],
    overallStatus: "loading",
  });

  const roleDefinitionQuery = useMemo(() => ({ roleDefinition: JSON.stringify(roleDefinition || {}) }), [roleDefinition]);

  useEffect(() => {
    let active = true;

    async function load() {
      setState((current) => ({ ...current, candidateId, roleDefinition, hasRoleDefinition, overallStatus: "loading" }));

      const [roleFit, performance, graph, trust, propagation, references] = await Promise.all([
        fetchSection<RoleFitResponse>(`/api/role-fit/${candidateId}`, roleDefinitionQuery),
        fetchSection<PerformancePredictionResponse>(`/api/performance-prediction/${candidateId}`, roleDefinitionQuery),
        fetchSection<RecruiterGraphInsightsResponse>(`/api/recruiter-graph-insights/candidate/${candidateId}`),
        fetchSection<ReputationTrustWeightingResponse>(`/api/reputation-trust-weighting/candidate/${candidateId}`),
        fetchSection<ReputationPropagationResponse>(`/api/reputation-propagation/candidate/${candidateId}`),
        fetchSection<CandidateReferencesResponse>(`/api/references/candidate/${candidateId}`),
      ]);

      let referenceQuality: SectionState<ReferenceQualityResponse[]> = { status: "empty", data: [], error: null };
      if (references.status === "success") {
        const sampledReferences = (references.data?.references || []).slice(0, 3);
        if (sampledReferences.length > 0) {
          const qualityResults = await Promise.all(
            sampledReferences.map((reference) => fetchSection<ReferenceQualityResponse>(`/api/reference-quality/${reference.id}`))
          );
          const successfulQuality = qualityResults
            .filter((result) => result.status === "success" && result.data)
            .map((result) => result.data as ReferenceQualityResponse);
          const forbiddenQuality = qualityResults.some((result) => result.status === "forbidden");
          const errorQuality = qualityResults.find((result) => result.status === "error");

          if (successfulQuality.length > 0) {
            referenceQuality = { status: "success", data: successfulQuality, error: null };
          } else if (forbiddenQuality) {
            referenceQuality = { status: "forbidden", data: null, error: "Reference quality details require additional permission." };
          } else if (errorQuality) {
            referenceQuality = { status: "error", data: null, error: errorQuality.error };
          }
        }
      }

      const benchmark = buildBenchmarkSummary(roleFit, performance, graph, trust, propagation);
      const summaryText = buildSummaryText({ roleFit, performance, graph, benchmark, hasRoleDefinition });
      const topCaveats = collectTopCaveats(roleFit, performance, graph, trust, propagation);
      const overallStatus = resolveOverallStatus({ roleFit, performance, graph, trust, propagation, references, referenceQuality });

      if (!active) return;
      setState({
        candidateId,
        roleDefinition,
        hasRoleDefinition,
        roleFit,
        performance,
        graph,
        trust,
        propagation,
        references,
        referenceQuality,
        benchmark,
        summaryText,
        topCaveats,
        overallStatus,
      });
    }

    void load();
    return () => {
      active = false;
    };
  }, [candidateId, roleDefinition, roleDefinitionQuery, hasRoleDefinition]);

  return state;
}

export const recruiterDashboardTestables = {
  resolveOverallStatus,
  majorSectionKeys,
};
