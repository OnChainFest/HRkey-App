"use client";

import { useState } from "react";

import { apiGet } from "@/lib/apiClient";

export default function ApiClientExamplePage() {
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTestCall = async () => {
    setLoading(true);
    setOutput(null);
    setError(null);
    try {
      const data = await apiGet<{ status?: string; message?: string }>("/api/health", {
        auth: false,
      });
      setOutput(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setError(err?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-slate-500">API client demo</p>
        <h1 className="text-3xl font-semibold text-slate-900">Frontend API wrapper</h1>
        <p className="text-slate-700">
          Import <code>apiGet</code>, <code>apiPost</code>, or <code>apiPatch</code> from <code>@/lib/apiClient</code>
          to make authenticated requests with normalized errors.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTestCall}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? "Calling…" : "Test /api/health (no auth)"}
          </button>
          <p className="text-sm text-slate-600">Update the path to target your endpoint.</p>
        </div>

        {output && (
          <pre className="text-xs bg-slate-900 text-white rounded-lg p-3 overflow-x-auto">{output}</pre>
        )}

        {error && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{error}</div>
        )}
      </section>
    </main>
  );
}

