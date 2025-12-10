"use client";

import Head from "next/head";
import { useEffect, useMemo, useState } from "react";

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

const formatCurrency = (value: number | null | undefined) =>
  value === undefined || value === null
    ? "—"
    : value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const formatNumber = (value: number | null | undefined) =>
  value === undefined || value === null ? "—" : Math.round(value).toLocaleString();

type PublicProfileResponse = {
  userId: string;
  handle: string | null;
  fullName: string | null;
  headline: string | null;
  skills: string[] | null;
  hrScore: number;
  priceUsd: number;
  hrkTokens: number | null;
};

type PageProps = {
  params: { identifier: string };
};

export default function PublicProfilePage({ params }: PageProps) {
  const { identifier } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfileResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const baseUrl = resolveApiBase();
        const res = await fetch(`${baseUrl}/api/public/candidates/${identifier}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("This public profile is not available.");
          }
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Unable to load this public profile.");
        }
        const data = (await res.json()) as PublicProfileResponse;
        setProfile(data);
      } catch (err: any) {
        setError(err?.message || "Unable to load this public profile.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [identifier]);

  const profileLabel = useMemo(() => {
    const score = profile?.hrScore ?? 0;
    if (score >= 80) return "High-impact candidate";
    if (score >= 60) return "Strong candidate";
    return "Developing candidate";
  }, [profile?.hrScore]);

  const pageTitle = profile
    ? `${profile.fullName || "HRKey Candidate"} – HRKey Profile`
    : "HRKey Candidate Profile";
  const pageDescription = profile
    ? `HRKey Score ${Math.round(profile.hrScore)}/100 – structured references and dynamic value insights for ${
        profile.fullName || "this candidate"
      }.`
    : "HRKey public candidate profile.";

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
      </Head>

      {loading && (
        <div className="p-4 rounded-md border border-slate-200 bg-white shadow-sm text-slate-700">
          Loading public profile…
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded-md border border-amber-200 bg-amber-50 text-amber-800">{error}</div>
      )}

      {!loading && !error && profile && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-lg p-6 space-y-3">
            <p className="text-sm text-slate-500">Public HRKey profile</p>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-semibold text-slate-900">{profile.fullName || "HRKey Candidate"}</h1>
                <p className="text-slate-600">{profile.headline || "Verified references overview"}</p>
                {profile.handle && <p className="text-xs text-slate-500">@{profile.handle}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                  HRKey Score: {Math.round(profile.hrScore)} / 100
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                  {formatCurrency(profile.priceUsd)} typical access price
                </span>
              </div>
            </div>
            <p className="text-sm text-indigo-700 font-semibold">{profileLabel}</p>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50 shadow-inner space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Why this matters</h2>
              <p className="text-sm text-slate-700">
                This profile summarizes verified professional references. HRKey highlights team impact, reliability,
                and communication so companies can quickly understand fit and value.
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                <li>HRKey Score reflects the strength and consistency of verified references.</li>
                <li>Pricing suggests the typical access tier for this candidate&apos;s references.</li>
                <li>Token estimates are illustrative for the HRKey ecosystem.</li>
              </ul>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">At-a-glance value</h2>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>HRKey Score</span>
                <span className="text-xl font-bold text-slate-900">{Math.round(profile.hrScore)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>Typical access price</span>
                <span className="text-xl font-bold text-slate-900">{formatCurrency(profile.priceUsd)}</span>
              </div>
              {profile.hrkTokens !== null && (
                <div className="flex items-center justify-between text-sm text-slate-700">
                  <span>Tokenized estimate</span>
                  <span className="text-lg font-semibold text-slate-900">≈ {formatNumber(profile.hrkTokens)} HRK</span>
                </div>
              )}
            </div>
          </section>

          {profile.skills && profile.skills.length > 0 && (
            <section className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
              <h3 className="text-lg font-semibold text-slate-900">Highlighted skills</h3>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-3 py-1 text-xs rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm space-y-2">
            <h3 className="text-lg font-semibold text-slate-900">What you&apos;re seeing</h3>
            <p className="text-sm text-slate-700">
              HRKey leverages structured feedback and scoring to highlight real-world impact, reliability, and team
              communication. Use this profile to decide if you want to request deeper access to the candidate&apos;s
              references.
            </p>
          </section>
        </div>
      )}

      {!loading && !error && !profile && (
        <div className="p-4 rounded-md border border-amber-200 bg-amber-50 text-amber-800">
          This HRKey public profile is not available.
        </div>
      )}
    </div>
  );
}
