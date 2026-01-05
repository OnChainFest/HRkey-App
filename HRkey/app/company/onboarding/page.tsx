"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiGet } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";

type Company = {
  id: string;
  name: string;
  tax_id?: string;
  domain_email?: string;
  verified: boolean;
};

export default function CompanyOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [existingCompany, setExistingCompany] = useState<Company | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    taxId: "",
    domainEmail: "",
  });

  useEffect(() => {
    const checkExistingCompany = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          setError("Please sign in to create a company.");
          setLoading(false);
          return;
        }

        // Check if user already has a company
        const result = await apiGet<{ success: boolean; companies: Company[] }>("/api/companies/my");

        if (result.success && result.companies && result.companies.length > 0) {
          // User already has a company, redirect to dashboard
          setExistingCompany(result.companies[0]);
          setTimeout(() => {
            router.push("/company/dashboard");
          }, 2000);
        }
      } catch (err: any) {
        console.error("Failed to check existing company", err);
        // If error is 404 or similar, user doesn't have a company yet - that's OK
        if (err.status !== 404) {
          setError(err.message || "Unable to check company status");
        }
      } finally {
        setLoading(false);
      }
    };

    checkExistingCompany();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await apiPost<{ success: boolean; company: Company; message: string }>(
        "/api/company/create",
        {
          name: formData.name,
          taxId: formData.taxId || undefined,
          domainEmail: formData.domainEmail || undefined,
        }
      );

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push("/company/dashboard");
        }, 1500);
      }
    } catch (err: any) {
      console.error("Failed to create company", err);
      setError(err.message || "Failed to create company. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  if (existingCompany) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-green-800">
          <h2 className="text-lg font-semibold mb-2">Company Already Exists</h2>
          <p>
            You already have a company: <strong>{existingCompany.name}</strong>
          </p>
          <p className="mt-2 text-sm">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Create Your Company Profile</h1>
        <p className="text-slate-600 mt-2">
          Set up your company to start requesting candidate data access.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      )}

      {success && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
          Company created successfully! Redirecting to dashboard...
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6 shadow-sm space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
            Company Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Acme Inc."
          />
        </div>

        <div>
          <label htmlFor="domainEmail" className="block text-sm font-medium text-slate-700 mb-1">
            Company Domain Email
          </label>
          <input
            type="email"
            id="domainEmail"
            name="domainEmail"
            value={formData.domainEmail}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="contact@acme.com"
          />
          <p className="mt-1 text-xs text-slate-500">Optional: Used for verification purposes</p>
        </div>

        <div>
          <label htmlFor="taxId" className="block text-sm font-medium text-slate-700 mb-1">
            Tax ID / Business Registration Number
          </label>
          <input
            type="text"
            id="taxId"
            name="taxId"
            value={formData.taxId}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="12-3456789"
          />
          <p className="mt-1 text-xs text-slate-500">Optional: Required for verification</p>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={submitting || !formData.name}
            className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating Company..." : "Create Company"}
          </button>
        </div>

        <div className="pt-2 text-sm text-slate-600">
          <p>
            By creating a company, you agree to our terms of service. Your company will require admin
            verification before you can request data access.
          </p>
        </div>
      </form>
    </div>
  );
}
