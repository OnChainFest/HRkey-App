"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AdminOverview = {
  auditEvents: { total: number; last24h: number; last7d: number };
  revenue: { totalUsd: number; last30dUsd: number };
  dataAccessRequests: { total: number; pending: number; approved: number; rejected: number };
  kpiObservations: { total: number; last30d: number };
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
    : "—";

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      setForbidden(false);
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          setError("Please sign in as a superadmin to view this dashboard.");
          setLoading(false);
          return;
        }

        const token = sessionData.session.access_token;
        const baseUrl = resolveApiBase();
        const res = await fetch(`${baseUrl}/api/admin/overview`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 403) {
          setForbidden(true);
          setLoading(false);
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Failed to load admin overview");
        }

        const data: AdminOverview = await res.json();
        setOverview(data);
      } catch (err: any) {
        console.error("Failed to load admin overview", err);
        setError(err?.message || "Unexpected error loading admin overview.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Admin Dashboard</h1>
      <p className="text-sm text-slate-600 mb-6">Monitoring snapshot for audit, revenue, data access, and KPIs.</p>

      {loading && <div className="text-slate-600">Loading admin overview…</div>}

      {!loading && forbidden && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          You don&apos;t have permission to view this dashboard. Superadmin access required.
        </div>
      )}

      {!loading && !forbidden && error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      )}

      {!loading && !forbidden && !error && overview && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Audit Events</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="flex justify-between"><span>Total</span><span>{overview.auditEvents.total}</span></div>
              <div className="flex justify-between"><span>Last 24h</span><span>{overview.auditEvents.last24h}</span></div>
              <div className="flex justify-between"><span>Last 7 days</span><span>{overview.auditEvents.last7d}</span></div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Revenue</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="flex justify-between"><span>Total</span><span>{currency(overview.revenue.totalUsd)}</span></div>
              <div className="flex justify-between"><span>Last 30 days</span><span>{currency(overview.revenue.last30dUsd)}</span></div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Data Access Requests</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="flex justify-between"><span>Total</span><span>{overview.dataAccessRequests.total}</span></div>
              <div className="flex justify-between"><span>Pending</span><span>{overview.dataAccessRequests.pending}</span></div>
              <div className="flex justify-between"><span>Approved</span><span>{overview.dataAccessRequests.approved}</span></div>
              <div className="flex justify-between"><span>Rejected</span><span>{overview.dataAccessRequests.rejected}</span></div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">KPI Observations</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="flex justify-between"><span>Total</span><span>{overview.kpiObservations.total}</span></div>
              <div className="flex justify-between"><span>Last 30 days</span><span>{overview.kpiObservations.last30d}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
