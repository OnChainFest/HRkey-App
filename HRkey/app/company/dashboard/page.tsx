"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";

type Company = {
  id: string;
  name: string;
  tax_id?: string;
  domain_email?: string;
  verified: boolean;
  created_at: string;
};

type DataAccessRequest = {
  id: string;
  targetUserId: string;
  status: string;
  requestedDataType: string;
  priceAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  dataAccessed: boolean;
};

export default function CompanyDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [requests, setRequests] = useState<DataAccessRequest[]>([]);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          setError("Please sign in to view your company dashboard.");
          setLoading(false);
          return;
        }

        // Get user's companies
        const companiesResult = await apiGet<{ success: boolean; companies: Company[] }>(
          "/api/companies/my"
        );

        if (!companiesResult.success || !companiesResult.companies || companiesResult.companies.length === 0) {
          // No company found, redirect to onboarding
          router.push("/company/onboarding");
          return;
        }

        const userCompany = companiesResult.companies[0];
        setCompany(userCompany);

        // Get company's data access requests
        try {
          const requestsResult = await apiGet<{ success: boolean; requests: DataAccessRequest[]; total: number }>(
            `/api/company/${userCompany.id}/data-access/requests`
          );

          if (requestsResult.success && requestsResult.requests) {
            // Show only the most recent 5 requests
            setRequests(requestsResult.requests.slice(0, 5));
          }
        } catch (reqErr: any) {
          console.error("Failed to load requests", reqErr);
          // Don't fail the whole page if requests fail
        }
      } catch (err: any) {
        console.error("Failed to load company dashboard", err);
        setError(err.message || "Unable to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [router]);

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === "approved") {
      return <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Approved</span>;
    }
    if (statusLower === "pending") {
      return <span className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">Pending</span>;
    }
    if (statusLower === "rejected") {
      return <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">Rejected</span>;
    }
    if (statusLower === "expired") {
      return <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">Expired</span>;
    }
    return <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{status}</span>;
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-lg border p-6 bg-white shadow-sm">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-700">
          <h2 className="text-lg font-semibold mb-2">No Company Found</h2>
          <p className="mb-4">You need to create a company profile first.</p>
          <Link
            href="/company/onboarding"
            className="inline-flex px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            Create Company Profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{company.name}</h1>
          <p className="text-slate-600 mt-1">Company Dashboard</p>
        </div>
        <Link
          href="/company/data-access/new"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Request Data Access
        </Link>
      </div>

      {/* Company Info Card */}
      <div className="rounded-lg border bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">Company Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-600">Status:</span>{" "}
            {company.verified ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                ✓ Verified
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                Pending Verification
              </span>
            )}
          </div>
          {company.domain_email && (
            <div>
              <span className="text-slate-600">Domain Email:</span> <span className="font-medium">{company.domain_email}</span>
            </div>
          )}
          {company.tax_id && (
            <div>
              <span className="text-slate-600">Tax ID:</span> <span className="font-medium">{company.tax_id}</span>
            </div>
          )}
          <div>
            <span className="text-slate-600">Created:</span>{" "}
            <span className="font-medium">{new Date(company.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        {!company.verified && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            <p className="font-medium">⏳ Awaiting Verification</p>
            <p className="mt-1">
              Your company profile is pending admin verification. You can create data access requests once verified.
            </p>
          </div>
        )}
      </div>

      {/* Recent Requests */}
      <div className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Data Access Requests</h2>
          <span className="text-sm text-slate-600">{requests.length} request{requests.length !== 1 ? "s" : ""}</span>
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-8 text-slate-600">
            <p className="mb-4">No data access requests yet.</p>
            <Link
              href="/company/data-access/new"
              className="inline-flex px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
            >
              Create Your First Request
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <Link
                key={request.id}
                href={`/company/data-access/${request.id}`}
                className="block rounded-lg border p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusBadge(request.status)}
                      <span className="text-sm text-slate-600">
                        {request.requestedDataType || "reference"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">
                      Candidate: <span className="font-mono text-xs">{request.targetUserId}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Created: {new Date(request.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      ${request.priceAmount} {request.currency}
                    </p>
                    {request.dataAccessed && (
                      <span className="text-xs text-green-600">✓ Data accessed</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/company/data-access/new"
            className="flex items-center gap-3 p-4 rounded-lg border hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
              +
            </div>
            <div>
              <h3 className="font-medium">Request Data Access</h3>
              <p className="text-sm text-slate-600">Request access to candidate data</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
