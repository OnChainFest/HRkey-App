"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";

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

interface EmployerSectionProps {
  userId: string;
}

export default function EmployerSection({ userId }: EmployerSectionProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [requests, setRequests] = useState<DataAccessRequest[]>([]);

  useEffect(() => {
    const loadEmployerData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get user's companies
        const companiesResult = await apiGet<{ success: boolean; companies: Company[] }>(
          "/api/companies/my"
        );

        if (
          !companiesResult.success ||
          !companiesResult.companies ||
          companiesResult.companies.length === 0
        ) {
          // No company found
          setCompany(null);
          setLoading(false);
          return;
        }

        const userCompany = companiesResult.companies[0];
        setCompany(userCompany);

        // Get company's data access requests
        try {
          const requestsResult = await apiGet<{
            success: boolean;
            requests: DataAccessRequest[];
            total: number;
          }>(`/api/company/${userCompany.id}/data-access/requests`);

          if (requestsResult.success && requestsResult.requests) {
            // Show only the most recent 5 requests
            setRequests(requestsResult.requests.slice(0, 5));
          }
        } catch (reqErr: any) {
          console.error("Failed to load requests", reqErr);
          // Don't fail the whole section if requests fail
        }
      } catch (err: any) {
        console.error("Failed to load employer data", err);
        setError(err.message || "Unable to load employer data");
      } finally {
        setLoading(false);
      }
    };

    loadEmployerData();
  }, [userId]);

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === "approved") {
      return (
        <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
          Approved
        </span>
      );
    }
    if (statusLower === "pending") {
      return (
        <span className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
          Pending
        </span>
      );
    }
    if (statusLower === "rejected") {
      return (
        <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
          Rejected
        </span>
      );
    }
    if (statusLower === "expired") {
      return (
        <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          Expired
        </span>
      );
    }
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <div className="text-gray-500">Loading employer data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="text-red-700 font-medium">Error loading employer data</div>
        <div className="text-red-600 text-sm mt-1">{error}</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Company Dashboard</h2>
          <p className="text-sm text-gray-600 mt-1">
            Access candidate data and manage your company profile
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-2xl">🏢</div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-amber-900 mb-2">No Company Profile</h3>
              <p className="text-amber-800 mb-4">
                You need to create a company profile to access employer features.
              </p>
              <Link
                href="/company/onboarding"
                className="inline-flex px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Create Company Profile
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{company.name}</h2>
          <p className="text-sm text-gray-600 mt-1">Company Dashboard</p>
        </div>
        <Link
          href="/company/data-access/new"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Request Data Access
        </Link>
      </div>

      {/* Company Info Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Status:</span>{" "}
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
              <span className="text-gray-600">Domain Email:</span>{" "}
              <span className="font-medium">{company.domain_email}</span>
            </div>
          )}
          {company.tax_id && (
            <div>
              <span className="text-gray-600">Tax ID:</span>{" "}
              <span className="font-medium">{company.tax_id}</span>
            </div>
          )}
          <div>
            <span className="text-gray-600">Created:</span>{" "}
            <span className="font-medium">
              {new Date(company.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {!company.verified && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 text-lg">⏳</span>
              <div className="text-sm text-amber-800">
                <p className="font-medium">Awaiting Verification</p>
                <p className="mt-1">
                  Your company profile is pending admin verification. You can create data access
                  requests once verified.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Requests */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Data Access Requests</h3>
          <span className="text-sm text-gray-600">
            {requests.length} request{requests.length !== 1 ? "s" : ""}
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-gray-600 mb-4">No data access requests yet.</p>
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
                className="block border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusBadge(request.status)}
                      <span className="text-sm text-gray-600">
                        {request.requestedDataType || "reference"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Candidate:{" "}
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                        {request.targetUserId}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Created: {new Date(request.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      ${request.priceAmount} {request.currency}
                    </p>
                    {request.dataAccessed && (
                      <span className="text-xs text-green-600 font-medium">✓ Data accessed</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/company/data-access/new"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center text-indigo-600 font-bold text-lg transition-colors">
              +
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Request Data Access</h4>
              <p className="text-sm text-gray-600">Access candidate references and data</p>
            </div>
          </Link>

          <Link
            href={`/company/data-access/${company.id}`}
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 group-hover:bg-green-200 flex items-center justify-center text-green-600 font-bold text-lg transition-colors">
              📋
            </div>
            <div>
              <h4 className="font-medium text-gray-900">View All Requests</h4>
              <p className="text-sm text-gray-600">See all data access requests</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
