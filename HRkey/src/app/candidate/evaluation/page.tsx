"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ReferenceAnswer = {
  questionId: string;
  cleanedText: string;
  exaggerationFlag: boolean;
  positivityFlag: boolean;
  negativityFlag: boolean;
  impactSignal: number;
  reliabilitySignal: number;
  communicationSignal: number;
};

type AggregatedSignals = {
  teamImpact: number;
  reliability: number;
  communication: number;
};

type CandidateEvaluationResponse = {
  userId: string;
  scoring: {
    referenceAnalysis: {
      answers: ReferenceAnswer[];
      aggregatedSignals: AggregatedSignals;
    };
    hrScoreResult: {
      normalizedScore: number;
      hrScore: number;
    };
    pricingResult: {
      normalizedScore: number;
      priceUsd: number;
    };
  };
};

type TokenomicsPreviewResponse = {
  userId: string;
  priceUsd: number;
  hrScore: number;
  hrScoreNormalized: number;
  tokens: {
    rawTokens: number;
    clampedTokens: number;
  };
  revenueSplit: {
    platformUsd: number;
    referencePoolUsd: number;
    candidateUsd: number;
    totalUsd: number;
    normalizedPcts: {
      platform: number;
      referencePool: number;
      candidate: number;
    };
  };
  stakingPreview: {
    effectiveApr: number;
    estimatedRewardsHrk: number;
    stakeAmountHrk: number;
    lockMonths: number;
  };
};

const ENV_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_PUBLIC_URL ||
  "";

const normalizeBase = (base: string) => base.replace(/\/$/, "");

const resolveApiBase = () => {
  if (ENV_API_BASE) return normalizeBase(ENV_API_BASE);
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    const isLocal = origin.includes("localhost:3000") || origin.includes("127.0.0.1:3000");
    return normalizeBase(isLocal ? "http://localhost:3001" : origin);
  }
  return "http://localhost:3001";
};

const formatCurrency = (value: number | undefined) =>
  value === undefined ? "—" : value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const truncateText = (text: string, max = 160) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export default function CandidateEvaluationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<CandidateEvaluationResponse | null>(null);
  const [tokenomics, setTokenomics] = useState<TokenomicsPreviewResponse | null>(null);
  const [tokenomicsError, setTokenomicsError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setTokenomicsError(null);

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session || !sessionData.session.user) {
          setError("Please sign in to view your evaluation.");
          setLoading(false);
          return;
        }

        const accessToken = sessionData.session.access_token;
        const userId = sessionData.session.user.id;
        const baseUrl = resolveApiBase();
        const headers = { Authorization: `Bearer ${accessToken}` };

        const fetchJson = async <T,>(url: string) => {
          const res = await fetch(url, { headers });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || "Unable to load this data right now.");
          }
          return (await res.json()) as T;
        };

        const evaluationUrl = `${baseUrl}/api/candidates/${userId}/evaluation`;
        const tokenomicsUrl = `${baseUrl}/api/candidates/${userId}/tokenomics-preview`;

        const [evaluationResult, tokenomicsResult] = await Promise.allSettled([
          fetchJson<CandidateEvaluationResponse>(evaluationUrl),
          fetchJson<TokenomicsPreviewResponse>(tokenomicsUrl),
        ]);

        if (evaluationResult.status === "rejected") {
          throw evaluationResult.reason;
        }

        setEvaluation(evaluationResult.value);

        if (tokenomicsResult.status === "fulfilled") {
          setTokenomics(tokenomicsResult.value);
        } else {
          console.warn("Tokenomics preview unavailable", tokenomicsResult.reason);
          setTokenomicsError(tokenomicsResult.reason?.message || "Tokenomics preview unavailable.");
        }
        const url = `${baseUrl}/api/candidates/${userId}/evaluation`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || "Unable to load your evaluation right now.");
        }

        const payload: CandidateEvaluationResponse = await response.json();
        setEvaluation(payload);
      } catch (err: any) {
        console.error("Failed to load candidate evaluation", err);
        setError(err?.message || "Unexpected error loading evaluation.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const hrScore = evaluation?.scoring.hrScoreResult.hrScore ?? 0;
  const pricing = evaluation?.scoring.pricingResult.priceUsd ?? 10;
  const aggregated = evaluation?.scoring.referenceAnalysis.aggregatedSignals || {
    teamImpact: 0,
    reliability: 0,
    communication: 0,
  };

  const profileLabel = useMemo(() => {
    if (hrScore >= 80) return "High-impact profile";
    if (hrScore >= 60) return "Strong profile";
    return "Growing profile";
  }, [hrScore]);

  const answers = evaluation?.scoring.referenceAnalysis.answers ?? [];
  const tokenSplit = tokenomics?.revenueSplit;
  const tokens = tokenomics?.tokens;
  const staking = tokenomics?.stakingPreview;

  const formatPercent = (value?: number) =>
    value === undefined ? "—" : `${Math.round(Math.min(100, Math.max(0, value * 100)))}%`;

  const renderSignalBar = (label: string, value: number) => (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-slate-700">
        <span>{label}</span>
        <span className="font-semibold">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 rounded bg-slate-200">
        <div className="h-2 rounded bg-indigo-500" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your HRKey Evaluation</h1>
          <p className="text-slate-600 text-sm mt-1">
            Based on your verified references and profile signals.
          </p>
        </div>
        <button
          onClick={() => location.reload()}
          className="px-3 py-2 text-sm border rounded-lg shadow-sm bg-white hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="rounded-lg border p-4 bg-white shadow-sm">Loading your evaluation…</div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && evaluation && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-600">HRKey Score</div>
              <div className="mt-2 text-4xl font-bold text-slate-900">{Math.round(hrScore)}</div>
              <div className="mt-1 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
                {profileLabel}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-600">Suggested access price</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{formatCurrency(pricing)}</div>
              <div className="mt-1 text-sm text-slate-600">Based on your references and performance signals.</div>
            </div>
          </div>

          {tokenomicsError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
              Tokenomics preview is temporarily unavailable. Your HRScore and USD price are still available.
            </div>
          )}

          {tokenomics && (
            <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Tokenomics preview</h2>
                <span className="text-xs text-slate-500">Illustrative, non-binding preview</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border bg-slate-50 p-4 shadow-sm">
                  <div className="text-sm text-slate-600">HRK token equivalent</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {Math.round(tokens?.clampedTokens ?? 0).toLocaleString("en-US")} HRK
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Based on your suggested price of {formatCurrency(tokenomics.priceUsd)} and internal HRK rate.
                  </p>
                </div>

                <div className="rounded-lg border bg-slate-50 p-4 shadow-sm space-y-2">
                  <div className="text-sm font-semibold text-slate-700">Revenue split (USD)</div>
                  <div className="text-sm flex items-center justify-between">
                    <span>Platform</span>
                    <span className="font-semibold">{formatCurrency(tokenSplit?.platformUsd)}</span>
                  </div>
                  <div className="text-xs text-slate-600">{formatPercent(tokenSplit?.normalizedPcts.platform)} share</div>
                  <div className="text-sm flex items-center justify-between">
                    <span>Reference providers</span>
                    <span className="font-semibold">{formatCurrency(tokenSplit?.referencePoolUsd)}</span>
                  </div>
                  <div className="text-xs text-slate-600">{formatPercent(tokenSplit?.normalizedPcts.referencePool)} share</div>
                  <div className="text-sm flex items-center justify-between">
                    <span>You (candidate)</span>
                    <span className="font-semibold">{formatCurrency(tokenSplit?.candidateUsd)}</span>
                  </div>
                  <div className="text-xs text-slate-600">{formatPercent(tokenSplit?.normalizedPcts.candidate)} share</div>
                </div>

                <div className="rounded-lg border bg-slate-50 p-4 shadow-sm space-y-2">
                  <div className="text-sm font-semibold text-slate-700">Potential staking rewards</div>
                  <div className="text-3xl font-bold text-slate-900">{formatPercent(staking?.effectiveApr)}</div>
                  <div className="text-sm text-slate-700">
                    If you staked ~{Math.round(staking?.stakeAmountHrk ?? 0).toLocaleString("en-US")} HRK for
                    {" "}
                    {staking?.lockMonths ?? 0} months, estimated rewards could be
                    {" "}
                    {Math.round(staking?.estimatedRewardsHrk ?? 0).toLocaleString("en-US")} HRK.
                  </div>
                  <div className="text-xs text-slate-600">
                    This preview is for simulation purposes only; final tokenomics may differ.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Aggregated signals</h2>
              <span className="text-xs text-slate-500">0% = low, 100% = high</span>
            </div>
            <div className="space-y-3">
              {renderSignalBar("Team impact", aggregated.teamImpact)}
              {renderSignalBar("Reliability", aggregated.reliability)}
              {renderSignalBar("Communication", aggregated.communication)}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Reference summaries</h2>
              <span className="text-sm text-slate-600">{answers.length} reference{answers.length === 1 ? "" : "s"}</span>
            </div>

            {answers.length === 0 && <p className="text-sm text-slate-600">No references available yet.</p>}

            <div className="space-y-3">
              {answers.map((answer, index) => (
                <div key={`${answer.questionId}-${index}`} className="rounded-lg border p-4 bg-slate-50">
                  <div className="flex items-center justify-between text-sm text-slate-700">
                    <span className="font-semibold">{answer.questionId || `Reference #${index + 1}`}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-800 leading-relaxed">
                    {truncateText(answer.cleanedText || "(No response)")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {answer.positivityFlag && (
                      <span className="rounded-full bg-green-100 text-green-700 px-3 py-1">Positive</span>
                    )}
                    {answer.negativityFlag && (
                      <span className="rounded-full bg-amber-100 text-amber-700 px-3 py-1">Contains concerns</span>
                    )}
                    {answer.exaggerationFlag && (
                      <span className="rounded-full bg-sky-100 text-sky-700 px-3 py-1">Exaggerated tone</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
