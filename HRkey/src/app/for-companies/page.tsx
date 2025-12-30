"use client";

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Section from "@/components/Section";
import { ApiClientError, apiPost } from "@/lib/apiClient";

export const metadata: Metadata = {
  title: "HRKey for Companies | Verified references with consent",
  description:
    "Register your company to request verified professional references with candidate consent and transparent access.",
};

type FormState = {
  companyName: string;
  legalName: string;
  country: string;
  website: string;
  email: string;
};

export default function ForCompaniesPage() {
  const [formState, setFormState] = useState<FormState>({
    companyName: "",
    legalName: "",
    country: "Costa Rica",
    website: "",
    email: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdCompanyId, setCreatedCompanyId] = useState<string | number | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const handleChange = (key: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.companyName.trim()) {
      setError("Company name is required.");
      setSuccessMessage(null);
      setCreatedCompanyId(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    setCreatedCompanyId(null);
    setRawResponse(null);

    try {
      const payload = {
        companyName: formState.companyName,
        legalName: formState.legalName || undefined,
        country: formState.country || undefined,
        website: formState.website || undefined,
        email: formState.email || undefined,
      };
      const response = await apiPost("/api/company/create", payload);
      const companyId = (response as any)?.companyId ?? (response as any)?.id ?? null;

      setSuccessMessage("Company created successfully.");
      setCreatedCompanyId(companyId);
      setRawResponse(response);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(`Request failed${err.status ? ` (${err.status})` : ""}: ${err.message}`);
      } else {
        setError("Something went wrong while creating the company. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <Section className="max-w-2xl">
        <div className="py-10">
          <h1 className="text-3xl font-bold">Company Registration</h1>
          <p className="mt-2 text-slate-600">
            Submit your company details to request access to verified professional references with candidate consent.
          </p>
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Company name *</label>
              <input
                type="text"
                value={formState.companyName}
                onChange={handleChange("companyName")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                placeholder="Acme Corp"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Legal name</label>
              <input
                type="text"
                value={formState.legalName}
                onChange={handleChange("legalName")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                placeholder="Acme Corporation LLC"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Country</label>
              <input
                type="text"
                value={formState.country}
                onChange={handleChange("country")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                placeholder="Costa Rica"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Website</label>
              <input
                type="url"
                value={formState.website}
                onChange={handleChange("website")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={formState.email}
                onChange={handleChange("email")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                placeholder="team@example.com"
              />
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full justify-center inline-flex items-center rounded-md bg-[#FF6B35] px-6 py-3 text-white font-semibold hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting..." : "Create company"}
              </button>
            </div>
          </form>

          {error ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
          ) : null}

          {successMessage ? (
            <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-700 space-y-2">
              <div>{successMessage}</div>
              {createdCompanyId ? <div className="font-semibold">Company ID: {createdCompanyId}</div> : null}
              {!createdCompanyId && rawResponse ? (
                <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {JSON.stringify(rawResponse, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </Section>
    </main>
  );
}
