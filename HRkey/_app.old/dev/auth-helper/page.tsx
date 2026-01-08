"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// DEV HELPER PAGE - Only for local testing
// Shows current user ID and session info for manual E2E testing
// Uses dynamic import to avoid build-time crashes when env vars are missing

export default function DevAuthHelperPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only show in development
    if (process.env.NODE_ENV === "production") {
      setError("This page is only available in development mode");
      setLoading(false);
      return;
    }

    const loadSession = async () => {
      try {
        // Dynamic import to avoid build-time initialization
        const { supabase }: any = await import("@/lib/supabaseClient");
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setError(`Session error: ${sessionError.message}`);
          setLoading(false);
          return;
        }

        if (!sessionData.session) {
          setError("No active session - please sign in first");
          setLoading(false);
          return;
        }

        setUserId(sessionData.session.user.id);
        setUserEmail(sessionData.session.user.email || "N/A");
        setSessionInfo(JSON.stringify({
          userId: sessionData.session.user.id,
          email: sessionData.session.user.email,
          role: sessionData.session.user.role,
          createdAt: sessionData.session.user.created_at,
          expiresAt: sessionData.session.expires_at,
        }, null, 2));

        setLoading(false);
      } catch (err: any) {
        setError(`Error: ${err.message}`);
        setLoading(false);
      }
    };

    loadSession();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  if (process.env.NODE_ENV === "production") {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="rounded-lg border border-red-300 p-6 bg-red-50">
          <p className="text-red-800 font-semibold">Access Denied</p>
          <p className="text-red-600 mt-2">This page is only available in development mode.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="rounded-lg border p-6 bg-white shadow-sm">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dev Auth Helper</h1>
        <p className="mt-2 text-sm text-gray-600">
          Local-only helper for manual E2E testing. Shows your current session info.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-300 p-6 bg-red-50">
          <p className="text-red-800 font-semibold">Error</p>
          <p className="text-red-600 mt-2">{error}</p>
        </div>
      )}

      {userId && (
        <div className="space-y-6">
          <div className="rounded-lg border p-6 bg-white shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Session</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">User ID</label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-100 rounded border text-sm font-mono">
                    {userId}
                  </code>
                  <button
                    onClick={() => copyToClipboard(userId)}
                    className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <div className="mt-1">
                  <code className="block px-3 py-2 bg-gray-100 rounded border text-sm font-mono">
                    {userEmail}
                  </code>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-6 bg-white shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Session Details (JSON)</h2>
            <pre className="bg-gray-100 p-4 rounded border text-xs overflow-auto max-h-96">
              {sessionInfo}
            </pre>
            <button
              onClick={() => sessionInfo && copyToClipboard(sessionInfo)}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              Copy JSON
            </button>
          </div>

          <div className="rounded-lg border border-blue-200 p-6 bg-blue-50">
            <h2 className="text-lg font-semibold text-blue-900 mb-3">Quick Links for Testing</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/company/onboarding" className="text-blue-700 hover:underline">
                  → Company Onboarding (B1)
                </Link>
              </li>
              <li>
                <Link href="/company/dashboard" className="text-blue-700 hover:underline">
                  → Company Dashboard (B2)
                </Link>
              </li>
              <li>
                <Link href="/company/data-access/new" className="text-blue-700 hover:underline">
                  → Create Data Access Request (B3)
                </Link>
              </li>
              <li className="text-gray-600">
                → Request Status Page (B4): /company/data-access/[requestId]
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-yellow-200 p-6 bg-yellow-50">
            <h3 className="text-sm font-semibold text-yellow-900 mb-2">Testing Notes</h3>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>Use this User ID when creating data access requests</li>
              <li>You'll need TWO users: one company signer, one target candidate</li>
              <li>Create a company first, then create a request targeting another user ID</li>
              <li>The target user must approve the request using the approval endpoint</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
