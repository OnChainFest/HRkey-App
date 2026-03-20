import { render, screen } from "@testing-library/react";
import TalentIntelligenceDashboard from "@/components/recruiter-intelligence/TalentIntelligenceDashboard";
import { buildBenchmarkSummary } from "@/lib/recruiter-intelligence/helpers";
import { recruiterDashboardTestables } from "@/lib/recruiter-intelligence/useTalentIntelligenceDashboard";
import type { SectionState, TalentIntelligenceDashboardData } from "@/lib/recruiter-intelligence/types";

const successState = <T,>(data: T): SectionState<T> => ({ status: "success", error: null, data });
const errorState = <T,>(error: string): SectionState<T> => ({ status: "error", error, data: null });
const emptyState = <T,>(message = "Empty"): SectionState<T> => ({ status: "empty", error: message, data: null });
const forbiddenState = <T,>(message = "Forbidden"): SectionState<T> => ({ status: "forbidden", error: message, data: null });

const baseDashboard: TalentIntelligenceDashboardData = {
  candidateId: "candidate-123",
  roleDefinition: {},
  hasRoleDefinition: false,
  roleFit: successState({
    ok: true,
    candidateId: "candidate-123",
    roleFitScore: 0.78,
    band: "strong",
    components: { skillMatch: 0.82, experienceAlignment: 0.74 },
    explanation: ["Strong overlap with current role requirements."],
    caveats: ["Reference quality is uneven across submissions."],
  }),
  performance: successState({
    ok: true,
    candidateId: "candidate-123",
    performancePredictionScore: 0.67,
    band: "moderate",
    components: { roleReadiness: 0.7, predictionConfidence: 0.59 },
    explanation: ["Current evidence suggests a supportive but bounded forecast."],
    caveats: ["Prediction remains limited by sparse or uneven evidence."],
  }),
  graph: successState({
    ok: true,
    target: { entityType: "candidate", entityId: "candidate-123" },
    summary: {
      overallGraphReadiness: "moderate",
      networkCredibilityBand: "moderate",
      candidateInfluenceBand: "limited",
      trustedCollaboratorBand: "strong",
    },
    insights: [
      {
        type: "network_credibility",
        band: "moderate",
        score: 0.62,
        headline: "Current evidence suggests moderate network credibility.",
        details: ["Two canonical collaborators provide graph-backed support."],
      },
    ],
    supportingCounts: {
      referenceCount: 3,
      canonicalRefereeCount: 2,
      confirmedRelationshipCount: 1,
      inferredRelationshipCount: 1,
      unresolvedReferenceCount: 1,
    },
    caveats: ["Graph remains sparse; treat these insights as supportive context rather than objective truth."],
  }),
  trust: successState({
    ok: true,
    target: { entityType: "candidate", entityId: "candidate-123" },
    weightedScore: 0.58,
    baseScore: 0.51,
    band: "moderate",
    caveats: ["Graph remains sparse, so weighting stays conservative and evidence-led."],
    weights: { finalCompositeWeight: 1.1 },
  }),
  propagation: successState({
    ok: true,
    target: { entityType: "candidate", entityId: "candidate-123" },
    score: 0.48,
    confidenceBand: "limited",
    explanations: ["Direct evidence currently drives most of the graph support."],
    caveats: ["Graph remains sparse; score is driven mostly by direct evidence."],
  }),
  references: successState({
    ok: true,
    candidateId: "candidate-123",
    count: 3,
    accessLevel: "granted_reference_access",
    references: [{ id: "ref-1" }, { id: "ref-2" }, { id: "ref-3" }],
  }),
  referenceQuality: successState([
    {
      ok: true,
      referenceId: "ref-1",
      qualityScore: 0.73,
      band: "strong",
      dimensions: { examples: 0.7 },
      explanation: ["Includes at least one concrete example."],
      caveats: ["Limited examples reduce strength."],
    },
  ]),
  benchmark: {
    strongestSignal: "Role fit",
    weakestSignal: "Graph-backed support",
    comparisons: [
      "Role fit is currently stronger than Graph-backed support.",
      "Current role readiness appears stronger than the bounded performance forecast.",
    ],
    evidenceGaps: ["1 reference signal is still unresolved in the graph."],
  },
  summaryText: "Role-fit and forecast signals are currently shown without a recruiter-selected role profile. Role fit is strong based on currently available evidence.",
  topCaveats: [
    "Reference quality is uneven across submissions.",
    "Prediction remains limited by sparse or uneven evidence.",
    "Graph remains sparse; treat these insights as supportive context rather than objective truth.",
  ],
  overallStatus: "ready",
};

describe("TalentIntelligenceDashboard", () => {
  it("renders role fit, performance, network, benchmark, and evidence sections when data is available", () => {
    render(<TalentIntelligenceDashboard data={baseDashboard} />);

    expect(screen.getAllByText("Role fit").length).toBeGreaterThan(0);
    expect(screen.getByText("Performance prediction")).toBeInTheDocument();
    expect(screen.getByText("Network reputation and graph context")).toBeInTheDocument();
    expect(screen.getByText("Relative signal balance")).toBeInTheDocument();
    expect(screen.getByText("Reference evidence")).toBeInTheDocument();
  });

  it("keeps the page usable when one major section fails", () => {
    render(
      <TalentIntelligenceDashboard
        data={{
          ...baseDashboard,
          overallStatus: "partial",
          graph: errorState("Graph insights are temporarily unavailable."),
        }}
      />
    );

    expect(screen.getByText("Some recruiter intelligence sections are unavailable right now. Available sections remain usable and are shown below.")).toBeInTheDocument();
    expect(screen.getByText("Graph insights are temporarily unavailable.")).toBeInTheDocument();
    expect(screen.getAllByText("Role fit").length).toBeGreaterThan(0);
  });

  it("renders a forbidden state when the recruiter lacks access", () => {
    render(<TalentIntelligenceDashboard data={{ ...baseDashboard, overallStatus: "forbidden" }} />);

    expect(screen.getByText("You do not have access to this recruiter intelligence dashboard. Permissioned candidate access is required.")).toBeInTheDocument();
  });

  it("surfaces sparse-evidence caveats prominently", () => {
    render(<TalentIntelligenceDashboard data={baseDashboard} />);

    expect(screen.getByText("Top caveats and trust notes")).toBeInTheDocument();
    expect(screen.getAllByText("Prediction remains limited by sparse or uneven evidence.").length).toBeGreaterThan(0);
    expect(screen.getByText("Graph remains sparse; treat these insights as supportive context rather than objective truth.")).toBeInTheDocument();
  });

  it("uses benchmark copy that avoids population ranking claims", () => {
    render(<TalentIntelligenceDashboard data={baseDashboard} />);

    expect(screen.getByText(/does not represent population ranking or percentile placement/i)).toBeInTheDocument();
    expect(screen.queryByText(/top performer/i)).not.toBeInTheDocument();
  });

  it("avoids overclaiming hiring language in recruiter-facing copy", () => {
    render(<TalentIntelligenceDashboard data={baseDashboard} />);

    expect(screen.queryByText(/must hire/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/safe to hire/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recommended hire/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/bounded forecast/i).length).toBeGreaterThan(0);
  });

  it("keeps rendering when sampled reference quality fails", () => {
    render(
      <TalentIntelligenceDashboard
        data={{
          ...baseDashboard,
          referenceQuality: errorState("Reference quality samples could not be loaded."),
        }}
      />
    );

    expect(screen.getByText("Reference evidence")).toBeInTheDocument();
    expect(screen.getByText("Reference quality samples could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("Reference count")).toBeInTheDocument();
  });

  it("handles missing component keys without crashing role fit or performance cards", () => {
    render(
      <TalentIntelligenceDashboard
        data={{
          ...baseDashboard,
          roleFit: successState({
            ok: true,
            candidateId: "candidate-123",
            roleFitScore: 0.55,
            band: "moderate",
            components: { skillMatch: 0.61, careerConsistency: undefined, brokenMetric: Number.NaN },
            explanation: null,
            caveats: undefined,
          }),
          performance: successState({
            ok: true,
            candidateId: "candidate-123",
            performancePredictionScore: 0.44,
            band: null,
            components: null,
            explanation: undefined,
            caveats: null,
          }),
        }}
      />
    );

    expect(screen.getByText("No prediction component breakdown was returned.")).toBeInTheDocument();
    expect(screen.queryByText("Broken Metric")).not.toBeInTheDocument();
    expect(screen.getByText("No forecast notes were returned.")).toBeInTheDocument();
  });

  it("shows truthful fallback copy when no recruiter-selected roleDefinition exists", () => {
    render(<TalentIntelligenceDashboard data={baseDashboard} />);

    expect(screen.getAllByText(/without a recruiter-selected role profile/i).length).toBeGreaterThan(0);
  });

  it("does not invent benchmark comparisons when insufficient signals are available", () => {
    const benchmark = buildBenchmarkSummary(
      successState({ ok: true, candidateId: "candidate-123", roleFitScore: 0.71, band: "strong" }),
      emptyState(),
      emptyState(),
      emptyState(),
      emptyState()
    );

    render(
      <TalentIntelligenceDashboard
        data={{
          ...baseDashboard,
          benchmark,
          performance: emptyState(),
          graph: emptyState(),
          trust: emptyState(),
          propagation: emptyState(),
        }}
      />
    );

    expect(benchmark.comparisons).toHaveLength(0);
    expect(screen.getByText("Comparative signal framing is unavailable until at least two signals load.")).toBeInTheDocument();
  });

  it("never renders undefined, null, or NaN junk text", () => {
    render(
      <TalentIntelligenceDashboard
        data={{
          ...baseDashboard,
          graph: successState({
            ok: true,
            target: { entityType: "candidate", entityId: "candidate-123" },
            summary: {},
            insights: [{ type: "network_credibility", headline: null, details: ["", null as unknown as string] }],
            supportingCounts: { unresolvedReferenceCount: null },
            caveats: [undefined as unknown as string, "Graph remains sparse; treat these insights as supportive context rather than objective truth."],
          }),
          referenceQuality: successState([
            {
              ok: true,
              referenceId: "ref-1",
              qualityScore: Number.NaN,
              band: null,
            },
          ]),
        }}
      />
    );

    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();
  });
});

describe("recruiterDashboardTestables.resolveOverallStatus", () => {
  it("returns partial instead of ready when a major section fails", () => {
    const result = recruiterDashboardTestables.resolveOverallStatus({
      roleFit: errorState("Role fit failed"),
      performance: baseDashboard.performance,
      graph: baseDashboard.graph,
      trust: baseDashboard.trust,
      propagation: baseDashboard.propagation,
      references: baseDashboard.references,
      referenceQuality: baseDashboard.referenceQuality,
    });

    expect(result).toBe("partial");
  });

  it("returns empty rather than forbidden when no major data exists", () => {
    const result = recruiterDashboardTestables.resolveOverallStatus({
      roleFit: emptyState(),
      performance: emptyState(),
      graph: emptyState(),
      trust: emptyState(),
      propagation: emptyState(),
      references: emptyState(),
      referenceQuality: emptyState(),
    });

    expect(result).toBe("empty");
  });

  it("treats sampled reference quality as secondary for ready status", () => {
    const result = recruiterDashboardTestables.resolveOverallStatus({
      roleFit: baseDashboard.roleFit,
      performance: baseDashboard.performance,
      graph: baseDashboard.graph,
      trust: baseDashboard.trust,
      propagation: baseDashboard.propagation,
      references: baseDashboard.references,
      referenceQuality: errorState("Reference quality failed"),
    });

    expect(result).toBe("ready");
  });

  it("returns forbidden only when every major section is forbidden", () => {
    const result = recruiterDashboardTestables.resolveOverallStatus({
      roleFit: forbiddenState(),
      performance: forbiddenState(),
      graph: forbiddenState(),
      trust: forbiddenState(),
      propagation: forbiddenState(),
      references: forbiddenState(),
      referenceQuality: forbiddenState(),
    });

    expect(result).toBe("forbidden");
  });
});
