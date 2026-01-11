"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

type Row = Record<string, any>;

interface EmployeeSectionProps {
  userId: string;
  userEmail: string;
}

export default function EmployeeSection({ userId, userEmail }: EmployeeSectionProps) {
  const [personId, setPersonId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // form (crear)
  const [newSummary, setNewSummary] = useState("");
  const [newRating, setNewRating] = useState<number>(5);
  const [newRefName, setNewRefName] = useState("");
  const [newRefEmail, setNewRefEmail] = useState("");

  // edición inline
  const [editId, setEditId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [editRating, setEditRating] = useState<number>(5);
  const [editRefName, setEditRefName] = useState("");
  const [editRefEmail, setEditRefEmail] = useState("");

  const ensurePerson = useCallback(async (uid: string) => {
    const q = await supabase.from("people").select("id").eq("user_id", uid).limit(1);
    const found = q.data?.[0]?.id as string | undefined;
    if (found) return found;
    const ins = await supabase.from("people").insert({ user_id: uid }).select("id").single();
    if (ins.error) throw ins.error;
    return ins.data.id as string;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let pid = personId;
      if (!pid) {
        pid = await ensurePerson(userId);
        setPersonId(pid);
      }

      const orClause = `owner_id.eq.${userId},person_id.eq.${pid}`;
      const { data, error } = await supabase
        .from("references")
        .select("*")
        .or(orClause)
        .order("created_at", { ascending: false });

      if (error) {
        setMsg(error.message);
        setRows([]);
      } else {
        setRows(data ?? []);
        if (msg && !msg.includes("OK") && !msg.includes("Invitación")) {
          setMsg(null);
        }
      }
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [ensurePerson, personId, userId, msg]);

  useEffect(() => {
    load();
  }, [load]);

  const createDraft = async () => {
    setMsg("Creating...");
    try {
      let pid = personId;
      if (!pid) {
        pid = await ensurePerson(userId);
        setPersonId(pid);
      }

      const { data, error } = await supabase
        .from("references")
        .insert([
          {
            owner_id: userId,
            person_id: pid,
            status: "draft",
            summary: newSummary || null,
            overall_rating: newRating ?? null,
            referrer_name: newRefName || null,
            referrer_email: newRefEmail || null,
          },
        ])
        .select("id")
        .single();

      if (error) return setMsg(`Error: ${error.message}`);
      setMsg(`✓ Reference created: ${data?.id}`);
      setNewSummary("");
      setNewRating(5);
      setNewRefName("");
      setNewRefEmail("");
      await load();
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? e}`);
    }
  };

  const startEdit = (r: Row) => {
    setEditId(r.id);
    setEditSummary(r.summary || "");
    setEditRating(typeof r.overall_rating === "number" ? r.overall_rating : 5);
    setEditRefName(r.referrer_name || "");
    setEditRefEmail(r.referrer_email || "");
  };

  const saveEdit = async () => {
    if (!editId) return;
    setMsg("Saving...");
    const { error } = await supabase
      .from("references")
      .update({
        summary: editSummary,
        overall_rating: editRating,
        referrer_name: editRefName || null,
        referrer_email: editRefEmail || null,
      })
      .eq("id", editId);

    if (error) return setMsg(`Error: ${error.message}`);
    setMsg("✓ Changes saved");
    setEditId(null);
    setEditSummary("");
    setEditRating(5);
    setEditRefName("");
    setEditRefEmail("");
    await load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this reference?")) return;
    setMsg("Deleting...");
    const { error } = await supabase.from("references").delete().eq("id", id);
    if (error) return setMsg(`Error: ${error.message}`);
    setMsg("✓ Deleted");
    await load();
  };

  const sendInvite = async (r: Row) => {
    setMsg("Creating invitation...");
    if (!r.referrer_email) {
      setMsg("Missing referrer email.");
      return;
    }

    const ins = await supabase
      .from("reference_invites")
      .insert([
        {
          reference_id: r.id,
          referrer_email: r.referrer_email,
          referrer_name: r.referrer_name || null,
        },
      ])
      .select("token")
      .single();

    if (ins.error) {
      setMsg(`Error creating invitation: ${ins.error.message}`);
      return;
    }
    const token = ins.data?.token as string;

    const upd = await supabase.from("references").update({ status: "submitted" }).eq("id", r.id);
    if (upd.error) {
      setMsg(`Invitation created, but couldn't update status: ${upd.error.message}`);
      return;
    }

    const link = `${window.location.origin}/ref/verify?token=${token}`;
    const subject = encodeURIComponent("Reference Invitation (HRKey)");
    const body = encodeURIComponent(
      `Hi${r.referrer_name ? " " + r.referrer_name : ""},\n\n` +
        `You've been invited to provide a verified reference.\n` +
        `Open this link:\n${link}\n\nThank you!`
    );
    const mailto = `mailto:${encodeURIComponent(r.referrer_email)}?subject=${subject}&body=${body}`;

    setMsg(`✓ Invitation ready.\nLink:\n${link}\n\nSend via email: ${mailto}`);
    await load();
  };

  const showInviteLink = async (referenceId: string, refEmail?: string, refName?: string) => {
    const { data, error } = await supabase
      .from("reference_invites")
      .select("token, expires_at, status")
      .eq("reference_id", referenceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      setMsg("No invitation found for this reference.");
      return;
    }

    const link = `${window.location.origin}/ref/verify?token=${data.token}`;
    const subject = encodeURIComponent("Reference Invitation (HRKey)");
    const body = encodeURIComponent(
      `Hi${refName ? " " + refName : ""},\n\n` +
        `You've been invited to provide a verified reference.\n` +
        `Open this link:\n${link}\n\nThank you!`
    );
    const mailto = `mailto:${encodeURIComponent(refEmail || "")}?subject=${subject}&body=${body}`;

    setMsg(`Invitation link:\n${link}\n\nSend via email: ${mailto}`);
  };

  const fmt = (v: any) => {
    try {
      if (!v) return "—";
      const d = new Date(v);
      return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
    } catch {
      return String(v);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My References</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage references from colleagues and supervisors
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Refresh
        </button>
      </div>

      {/* Create New Reference */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Reference</h3>
        <div className="grid gap-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
            <textarea
              placeholder="Brief description of the reference"
              value={newSummary}
              onChange={(e) => setNewSummary(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rating (1–5)
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={newRating}
              onChange={(e) => setNewRating(Number(e.target.value))}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Referrer Name
              </label>
              <input
                placeholder="John Doe"
                value={newRefName}
                onChange={(e) => setNewRefName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Referrer Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                placeholder="john@example.com"
                value={newRefEmail}
                onChange={(e) => setNewRefEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <button
            onClick={createDraft}
            className="w-full md:w-auto px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Create Draft
          </button>
        </div>
      </div>

      {/* Message Display */}
      {msg && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <pre className="text-sm text-blue-900 whitespace-pre-wrap font-mono">{msg}</pre>
        </div>
      )}

      {/* References List */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">References</h3>
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No references yet. Create your first one above!
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <article
                key={r.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase">ID</div>
                    <div className="font-mono text-sm text-gray-900">{r.id.slice(0, 8)}...</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase">Status</div>
                    <div>
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          r.status === "draft"
                            ? "bg-gray-100 text-gray-700"
                            : r.status === "submitted"
                            ? "bg-yellow-100 text-yellow-700"
                            : r.status === "verified"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {r.status || "—"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase">Created</div>
                    <div className="text-sm text-gray-900">{fmt(r.created_at)}</div>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="text-xs font-medium text-gray-500 uppercase mb-1">Summary</div>
                  <div className="text-sm text-gray-900 whitespace-pre-wrap">
                    {r.summary || "—"}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3 text-sm">
                  <div>
                    <span className="text-gray-500">Referrer:</span>{" "}
                    <span className="font-medium">{r.referrer_name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Email:</span>{" "}
                    <span className="font-medium">{r.referrer_email || "—"}</span>
                  </div>
                </div>

                {editId === r.id ? (
                  <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                    <textarea
                      rows={4}
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={editRating}
                        onChange={(e) => setEditRating(Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="Rating (1-5)"
                      />
                      <input
                        placeholder="Referrer name"
                        value={editRefName}
                        onChange={(e) => setEditRefName(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        placeholder="Referrer email"
                        value={editRefEmail}
                        onChange={(e) => setEditRefEmail(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditId(null);
                          setEditSummary("");
                          setEditRating(5);
                          setEditRefName("");
                          setEditRefEmail("");
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {r.status === "draft" && (
                      <button
                        onClick={() => sendInvite(r)}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                      >
                        Send Verification Invite
                      </button>
                    )}
                    {r.status === "submitted" && (
                      <button
                        onClick={() => showInviteLink(r.id, r.referrer_email, r.referrer_name)}
                        className="px-3 py-1.5 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700"
                      >
                        View Invite Link
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(r)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => del(r.id)}
                      className="px-3 py-1.5 bg-red-100 text-red-700 text-sm font-medium rounded-lg hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
