"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";

type Company = {
  id: string;
  name: string;
  verified: boolean;
};

export default function CreateDataAccessRequestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  const [formData, setFormData] = useState({
    candidateEmail: "",
    targetUserId: "",
    purpose: "",
    requestedDataType: "reference",
  });

  useEffect(() => {
    const loadCompany = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          setError("Please sign in to create a data access request.");
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
      } catch (err: any) {
        console.error("Failed to load company", err);
        setError(err.message || "Unable to load company information");
      } finally {
        setLoading(false);
      }
    };

    loadCompany();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!company) {
        throw new Error("Company not found");
      }

      // For now, we'll use targetUserId. In production, you might want to add
      // a lookup endpoint to find user by email
      if (!formData.targetUserId) {
        throw new Error("Please provide a candidate User ID");
      }

      const result = await apiPost<{ success: boolean; request: any; message: string }>(
        "/api/data-access/request",
        {
          companyId: company.id,
          targetUserId: formData.targetUserId,
          requestedDataType: formData.requestedDataType,
          requestReason: formData.purpose || undefined,
        }
      );

      if (result.success && result.request) {
        // Redirect to the request detail page
        router.push(`/company/data-access/${result.request.id}`);
      }
    } catch (err: any) {
      console.error("Failed to create request", err);
      setError(err.message || "Failed to create data access request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="rounded-lg border p-6 bg-white shadow-sm">Loading...</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
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
    <div className="max-w-2xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
          <Link href="/company/dashboard" className="hover:text-indigo-600">
            Dashboard
          </Link>
          <span>/</span>
          <span>New Request</span>
        </div>
        <h1 className="text-3xl font-bold">Request Data Access</h1>
        <p className="text-slate-600 mt-2">
          Request access to a candidate's verified references and profile data.
        </p>
      </div>

      {/* Company not verified warning */}
      {!company.verified && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <p className="font-medium">⚠️ Company Not Verified</p>
          <p className="mt-1 text-sm">
            Your company profile is pending verification. You can create requests, but candidates may be less
            likely to approve access from unverified companies.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6 shadow-sm space-y-5">
        <div>
          <label htmlFor="candidateEmail" className="block text-sm font-medium text-slate-700 mb-1">
            Candidate Email
          </label>
          <input
            type="email"
            id="candidateEmail"
            name="candidateEmail"
            value={formData.candidateEmail}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="candidate@example.com"
          />
          <p className="mt-1 text-xs text-slate-500">
            Enter the candidate's email address (for reference only)
          </p>
        </div>

        <div>
          <label htmlFor="targetUserId" className="block text-sm font-medium text-slate-700 mb-1">
            Candidate User ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="targetUserId"
            name="targetUserId"
            value={formData.targetUserId}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
            placeholder="00000000-0000-0000-0000-000000000000"
          />
          <p className="mt-1 text-xs text-slate-500">
            The UUID of the candidate in the HRKey system
          </p>
        </div>

        <div>
          <label htmlFor="requestedDataType" className="block text-sm font-medium text-slate-700 mb-1">
            Data Type
          </label>
          <select
            id="requestedDataType"
            name="requestedDataType"
            value={formData.requestedDataType}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="reference">Reference Only</option>
            <option value="profile">Profile Only</option>
            <option value="full_data">Full Data (Profile + References)</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Select what type of data you want to access
          </p>
        </div>

        <div>
          <label htmlFor="purpose" className="block text-sm font-medium text-slate-700 mb-1">
            Request Purpose (Optional)
          </label>
          <textarea
            id="purpose"
            name="purpose"
            value={formData.purpose}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="E.g., Hiring for Senior Engineer position"
          />
          <p className="mt-1 text-xs text-slate-500">
            Briefly explain why you're requesting access (visible to the candidate)
          </p>
        </div>

        {/* Info Box */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
          <p className="font-medium">📋 What happens next:</p>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            <li>The candidate will receive a notification about your request</li>
            <li>They can approve or reject the request</li>
            <li>If approved, payment will be processed and you'll gain access to the data</li>
            <li>Requests expire after 7 days if not approved</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.push("/company/dashboard")}
            className="flex-1 px-4 py-3 border border-slate-300 rounded-lg font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !formData.targetUserId}
            className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating Request..." : "Create Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
