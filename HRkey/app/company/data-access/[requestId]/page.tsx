"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";

type Company = {
  id: string;
  name: string;
  verified: boolean;
  logo_url?: string;
};

type Request = {
  id: string;
  company: Company;
  targetUserId: string;
  requestedByUserId: string;
  referenceId?: string;
  status: string;
  priceAmount: number;
  currency: string;
  requestedDataType: string;
  requestReason?: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  consentGivenAt?: string;
  dataAccessed: boolean;
  dataAccessedAt?: string;
  accessCount: number;
};

type PageProps = {
  params: { requestId: string };
};

export default function DataAccessRequestStatusPage({ params }: PageProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<Request | null>(null);

  useEffect(() => {
    const loadRequest = async () => {
      try {
        setLoading(true);
        setError(null);

        const { supabase }: any = await import("@/lib/supabaseClient");
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          setError("Please sign in to view this request.");
          setLoading(false);
          return;
        }

        const result = await apiGet<{ success: boolean; request: Request }>(
          `/api/data-access/request/${params.requestId}`
        );

        if (result.success && result.request) {
          setRequest(result.request);
        }
      } catch (err: any) {
        console.error("Failed to load request", err);
        if (err.status === 404) {
          setError("Request not found.");
        } else if (err.status === 403) {
          setError("You don't have permission to view this request.");
        } else {
          setError(err.message || "Unable to load request.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadRequest();
  }, [params.requestId]);

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === "approved") {
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-4 py-2 text-sm font-medium text-green-700">
          ✓ Approved
        </span>
      );
    }
    if (statusLower === "pending") {
      return (
        <span className="inline-flex items-center rounded-full bg-yellow-100 px-4 py-2 text-sm font-medium text-yellow-700">
          ⏳ Pending
        </span>
      );
    }
    if (statusLower === "rejected") {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-4 py-2 text-sm font-medium text-red-700">
          ✗ Rejected
        </span>
      );
    }
    if (statusLower === "expired") {
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
          ⌛ Expired
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
        {status}
      </span>
    );
  };

  const getStatusMessage = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === "approved") {
      return "The candidate has approved your data access request. You can now view the data.";
    }
    if (statusLower === "pending") {
      return "Your request is waiting for the candidate to approve or reject it.";
    }
    if (statusLower === "rejected") {
      return "The candidate has declined your data access request.";
    }
    if (statusLower === "expired") {
      return "This request has expired without being approved.";
    }
    return "Status unknown.";
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="rounded-lg border p-6 bg-white shadow-sm">Loading request...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
        <div className="mt-4">
          <Link
            href="/company/dashboard"
            className="inline-flex px-4 py-2 text-sm border rounded-lg shadow-sm bg-white hover:bg-slate-50"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-700">
          Request not found.
        </div>
      </div>
    );
  }

  const isExpired = new Date(request.expiresAt) < new Date();
  const canViewData = request.status.toLowerCase() === "approved";

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
          <Link href="/company/dashboard" className="hover:text-indigo-600">
            Dashboard
          </Link>
          <span>/</span>
          <span>Request Details</span>
        </div>
        <h1 className="text-3xl font-bold">Data Access Request</h1>
        <p className="text-slate-600 mt-1">Request ID: {request.id}</p>
      </div>

      {/* Status Card */}
      <div className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Status</h2>
          {getStatusBadge(request.status)}
        </div>
        <p className="text-slate-600">{getStatusMessage(request.status)}</p>

        {canViewData && (
          <div className="pt-4">
            <Link
              href={`/company/data-access/${request.id}/data`}
              className="inline-flex px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              View Candidate Data →
            </Link>
            {request.dataAccessed && (
              <p className="mt-2 text-sm text-green-600">
                ✓ Data accessed {request.accessCount} time{request.accessCount !== 1 ? "s" : ""}
                {request.dataAccessedAt && ` · Last accessed: ${new Date(request.dataAccessedAt).toLocaleString()}`}
              </p>
            )}
          </div>
        )}

        {request.status.toLowerCase() === "pending" && isExpired && (
          <div className="pt-4 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            <p className="font-medium">⚠️ Request Expired</p>
            <p className="mt-1">This request has expired and will be automatically marked as expired.</p>
          </div>
        )}
      </div>

      {/* Request Details */}
      <div className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Request Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-600">Candidate User ID:</span>
            <p className="font-mono text-xs mt-1 break-all">{request.targetUserId}</p>
          </div>

          <div>
            <span className="text-slate-600">Data Type:</span>
            <p className="font-medium mt-1">{request.requestedDataType || "reference"}</p>
          </div>

          <div>
            <span className="text-slate-600">Price:</span>
            <p className="font-medium mt-1">
              ${request.priceAmount} {request.currency}
            </p>
          </div>

          <div>
            <span className="text-slate-600">Payment Status:</span>
            <p className="font-medium mt-1">{request.paymentStatus}</p>
          </div>

          <div>
            <span className="text-slate-600">Created:</span>
            <p className="font-medium mt-1">{new Date(request.createdAt).toLocaleString()}</p>
          </div>

          <div>
            <span className="text-slate-600">Expires:</span>
            <p className="font-medium mt-1">{new Date(request.expiresAt).toLocaleString()}</p>
          </div>

          {request.consentGivenAt && (
            <div>
              <span className="text-slate-600">Approved At:</span>
              <p className="font-medium mt-1">{new Date(request.consentGivenAt).toLocaleString()}</p>
            </div>
          )}

          {request.updatedAt && (
            <div>
              <span className="text-slate-600">Last Updated:</span>
              <p className="font-medium mt-1">{new Date(request.updatedAt).toLocaleString()}</p>
            </div>
          )}
        </div>

        {request.requestReason && (
          <div className="pt-4 border-t">
            <span className="text-sm text-slate-600">Request Purpose:</span>
            <p className="mt-1 text-sm">{request.requestReason}</p>
          </div>
        )}
      </div>

      {/* Company Info */}
      {request.company && (
        <div className="rounded-lg border bg-white p-6 shadow-sm space-y-2">
          <h2 className="text-lg font-semibold">Company</h2>
          <div className="flex items-center gap-3">
            {request.company.logo_url && (
              <img
                src={request.company.logo_url}
                alt={request.company.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            )}
            <div>
              <p className="font-medium">{request.company.name}</p>
              {request.company.verified && (
                <span className="inline-flex items-center text-xs text-green-600">
                  ✓ Verified Company
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          href="/company/dashboard"
          className="px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
        >
          ← Back to Dashboard
        </Link>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 border border-slate-300 rounded-lg font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
        >
          Refresh Status
        </button>
      </div>
    </div>
  );
}
