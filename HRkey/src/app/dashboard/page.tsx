"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DashboardOverview = {
  userProfile: {
    id: string;
    email: string | null;
    name: string;
    handle: string;
    walletAddress: string | null;
    identityVerified: boolean;
    createdAt: string | null;
  };
  roles: {
    candidateEnabled: boolean;
    referrerEnabled: boolean;
  };
  globalSummary: {
    rewardsBalance: number;
    notificationsCount: number;
  };
  candidateSummary: {
    pendingReferenceRequestsCount: number;
    completedReferencesCount: number;
    dataAccessRequestsCount: number;
    recentItems: Array<{
      type: string;
      title: string;
      description: string;
      timestamp: string;
      status: string;
    }>;
  };
  referrerSummary: {
    assignedRequestsCount: number;
    completedAsReferrerCount: number;
    rewardsEarned: number;
    recentItems: Array<{
      type: string;
      title: string;
      description: string;
      timestamp: string;
      status: string;
    }>;
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

const currency = (value: number | undefined) =>
  typeof value === "number"
    ? value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : "$0.00";

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

type DashboardMode = "candidate" | "referrer";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [mode, setMode] = useState<DashboardMode>("candidate");

  useEffect(() => {
    // Load saved mode from localStorage
    const savedMode = localStorage.getItem("dashboardMode") as DashboardMode | null;
    if (savedMode && (savedMode === "candidate" || savedMode === "referrer")) {
      setMode(savedMode);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          setError("Please sign in to view your dashboard.");
          setLoading(false);
          return;
        }

        const token = sessionData.session.access_token;
        const baseUrl = resolveApiBase();
        const res = await fetch(`${baseUrl}/api/dashboard/overview`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 401) {
          setError("Authentication required. Please sign in.");
          setLoading(false);
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Failed to load dashboard");
        }

        const data: DashboardOverview = await res.json();
        setOverview(data);

        // Auto-select mode if user only has one role enabled
        if (data.roles.candidateEnabled && !data.roles.referrerEnabled) {
          setMode("candidate");
        } else if (data.roles.referrerEnabled && !data.roles.candidateEnabled) {
          setMode("referrer");
        }
      } catch (err: any) {
        console.error("Failed to load dashboard overview", err);
        setError(err?.message || "Unexpected error loading dashboard.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleModeChange = (newMode: DashboardMode) => {
    setMode(newMode);
    localStorage.setItem("dashboardMode", newMode);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="text-slate-600">Loading your dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="text-slate-600">No data available.</div>
      </div>
    );
  }

  const showModeTabs = overview.roles.candidateEnabled && overview.roles.referrerEnabled;
  const candidateSummary = overview.candidateSummary;
  const referrerSummary = overview.referrerSummary;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome, {overview.userProfile.name}
        </h1>
        <p className="text-sm text-slate-600">
          {overview.userProfile.email}
          {overview.userProfile.identityVerified && (
            <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              Verified
            </span>
          )}
        </p>
      </div>

      {/* Global Summary Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">Rewards Balance</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {currency(overview.globalSummary.rewardsBalance)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">Notifications</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {overview.globalSummary.notificationsCount}
          </div>
        </div>
      </div>

      {/* Mode Tabs */}
      {showModeTabs && (
        <div className="mb-6 border-b border-slate-200">
          <nav className="flex space-x-4" aria-label="Dashboard modes">
            <button
              onClick={() => handleModeChange("candidate")}
              className={`border-b-2 px-4 py-2 text-sm font-medium ${
                mode === "candidate"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              My Profile
            </button>
            <button
              onClick={() => handleModeChange("referrer")}
              className={`border-b-2 px-4 py-2 text-sm font-medium ${
                mode === "referrer"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              Contributor
            </button>
          </nav>
        </div>
      )}

      {/* Candidate Mode */}
      {mode === "candidate" && overview.roles.candidateEnabled && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-medium text-slate-600">Pending Requests</h3>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {candidateSummary.pendingReferenceRequestsCount}
              </div>
              <p className="mt-1 text-xs text-slate-500">Reference requests sent</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-medium text-slate-600">Completed References</h3>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {candidateSummary.completedReferencesCount}
              </div>
              <p className="mt-1 text-xs text-slate-500">Received and active</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-medium text-slate-600">Data Access Requests</h3>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {candidateSummary.dataAccessRequestsCount}
              </div>
              <p className="mt-1 text-xs text-slate-500">Companies requesting access</p>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Recent Activity</h3>
            {candidateSummary.recentItems.length > 0 ? (
              <div className="space-y-3">
                {candidateSummary.recentItems.map((item, idx) => (
                  <div key={idx} className="flex items-start justify-between border-b border-slate-100 pb-3 last:border-0">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">{item.title}</div>
                      <div className="text-xs text-slate-600">{item.description}</div>
                    </div>
                    <div className="ml-4 flex flex-col items-end">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.status}
                      </span>
                      <span className="mt-1 text-xs text-slate-500">{formatDate(item.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">No recent activity</div>
            )}
          </div>

          {/* Primary CTA */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-blue-900">Request a New Reference</h4>
                <p className="text-sm text-blue-700">Build your professional profile with verified references.</p>
              </div>
              <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Request Reference
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Referrer Mode */}
      {mode === "referrer" && overview.roles.referrerEnabled && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-medium text-slate-600">Assigned Requests</h3>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {referrerSummary.assignedRequestsCount}
              </div>
              <p className="mt-1 text-xs text-slate-500">Pending your response</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-medium text-slate-600">Completed</h3>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {referrerSummary.completedAsReferrerCount}
              </div>
              <p className="mt-1 text-xs text-slate-500">References provided</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-medium text-slate-600">Rewards Earned</h3>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {currency(referrerSummary.rewardsEarned)}
              </div>
              <p className="mt-1 text-xs text-slate-500">From references provided</p>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Recent Activity</h3>
            {referrerSummary.recentItems.length > 0 ? (
              <div className="space-y-3">
                {referrerSummary.recentItems.map((item, idx) => (
                  <div key={idx} className="flex items-start justify-between border-b border-slate-100 pb-3 last:border-0">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">{item.title}</div>
                      <div className="text-xs text-slate-600">{item.description}</div>
                    </div>
                    <div className="ml-4 flex flex-col items-end">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.status}
                      </span>
                      <span className="mt-1 text-xs text-slate-500">{formatDate(item.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">No recent activity</div>
            )}
          </div>

          {/* Primary CTA */}
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-purple-900">View Pending Requests</h4>
                <p className="text-sm text-purple-700">
                  {referrerSummary.assignedRequestsCount > 0
                    ? `You have ${referrerSummary.assignedRequestsCount} pending reference request(s)`
                    : "No pending requests at the moment"}
                </p>
              </div>
              {referrerSummary.assignedRequestsCount > 0 && (
                <button className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
                  View Requests
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
