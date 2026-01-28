"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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
    const isLocal =
      origin.includes("localhost:3000") || origin.includes("127.0.0.1:3000");
    return normalizeBase(isLocal ? "http://localhost:3001" : origin);
  }
  return "http://localhost:3001";
};

const formatCurrency = (value: number | undefined) =>
  value === undefined
    ? "—"
    : value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const truncateText = (text: string, max = 180) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

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

type CandidateEvaluation = {
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

type DataAccessEvaluationResponse = {
  success?: boolean;
  requestId?: string;
  dataType?: string;
  accessedAt?: string;
  data?: any;
  evaluation?: CandidateEvaluation;
};

export default function DataAccessRequestPage() {
  const params = useParams<{ requestId?: string | string[] }>();
  const requestId = Array.isArray(params?.requestId)
    ? params?.requestId[0]
    : params?.requestId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] =
    useState<DataAccessEvaluationResponse | null>(null);

  useEffect(() => {
    if (!requestId) {
      setError("Missing data access request ID.");
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();
        if (
          sessionError ||
          !sessionData.session ||
          !sessionData.session.user
        ) {
          setError("Please sign in to view this data access request.");
          setLoading(false);
          return;
        }

        const accessToken = sessionData.session.access_token;
        const baseUrl = resolveApiBase();
        const url = `${baseUrl}/api/data-access/${requestId}/data`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const status = response.status;
          if (status === 401 || status === 403) {
            throw new Error(
              "You don't have permission to view this data access request."
            );
          }
          if (status === 404) {
            throw new Error("Data access request not found.");
          }
          throw new Error(body?.error || "Unable to load this request right now.");
        }

        const result: DataAccessEvaluationResponse = await response.json();
        setPayload(result);
      } catch (err: any) {
        console.error("Failed to load data access request", err);
        setError(err?.message || "Unexpected error loading request.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [requestId]);

  const evaluation = payload?.evaluation;
  const hrScore = evaluation?.scoring.hrScoreResult.hrScore ?? 0;
  const price = evaluation?.scoring.pricingResult.priceUsd ?? 10;
  const aggregated =
    evaluation?.scoring.referenceAnalysis.aggregatedSignals || {
      teamImpact: 0,
      reliability: 0,
      communication: 0,
    };

  const answers =
    evaluation?.scoring.referenceAnalysis.answers ?? [];

  const profileLabel = useMemo(() => {
    if (hrScore >= 80) return "High-impact candidate";
    if (hrScore >= 60) return "Strong candidate";
    return "Developing candidate";
  }, [hrScore]);

  const renderSignalBar = (label: string, value: number) => (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-slate-700">
        <span>{label}</span>
        <span className="font-semibold">
          {Math.round(Math.max(0, Math.min(1, value)) * 100)}%
        </span>
      </div>
      <div className="h-2 rounded bg-slate-200">
        <div
          className="h-2 rounded bg-indigo-500"
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Data Access Request</h1>
          <p className="text-slate-600 text-sm mt-1">
            Review the requested data and candidate evaluation.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Request ID: {payload?.requestId || requestId}
          </p>
          {evaluation?.userId && (
            <p className="text-xs text-slate-500">
              Candidate ID: {evaluation.userId}
            </p>
          )}
        </div>
        <button
          onClick={() => location.reload()}
          className="px-3 py-2 text-sm border rounded-lg shadow-sm bg-white hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="rounded-lg border p-4 bg-white shadow-sm">
          Loading request…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && payload && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-white p-5 shadow-sm space-y-2">
              <div className="text-sm text-slate-600">HRKey Score</div>
              <div className="text-4xl font-bold text-slate-900">
                {Math.round(hrScore)}
              </div>
              <div className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
                {profileLabel}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
              {renderSignalBar("Team impact", aggregated.teamImpact)}
              {renderSignalBar("Reliability", aggregated.reliability)}
              {renderSignalBar("Communication", aggregated.communication)}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Reference Answers</h2>
              <div className="text-sm text-slate-600">
                Price: {formatCurrency(price)}
              </div>
            </div>

            <div className="divide-y">
              {answers.map((a, idx) => (
                <div key={idx} className="py-3 space-y-1">
                  <div className="text-sm text-slate-700">
                    Q{idx + 1}: {truncateText(a.cleanedText)}
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
