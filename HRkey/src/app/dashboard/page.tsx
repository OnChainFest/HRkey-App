"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabaseClient";
import { apiPost, ApiClientError } from "../../lib/apiClient";
import { ReferenceIntegrityBadge } from "../../components/ReferenceIntegrityBadge";

type IntegrityStatus = "VALID" | "INVALID" | "UNKNOWN";

type Row = Record<string, any> & {
  integrity_status?: IntegrityStatus;
  tattoo_tx_hash?: string | null;
  tattoo_chain_id?: number | null;
  tattooed_at?: string | null;
}

export default function Dashboard() {
  const router = useRouter()
  const [userId, setUserId] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [personId, setPersonId] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  // form (crear)
  const [newSummary, setNewSummary] = useState("")
  const [newRating, setNewRating] = useState<number>(5)
  const [newRefName, setNewRefName] = useState("")
  const [newRefEmail, setNewRefEmail] = useState("")

  // edición inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editSummary, setEditSummary] = useState("")
  const [editRating, setEditRating] = useState<number>(5)
  const [editRefName, setEditRefName] = useState("")
  const [editRefEmail, setEditRefEmail] = useState("")

  // --- helpers --------------------------------------------------------------

  const ensurePerson = useCallback(async (uid: string) => {
    const q = await supabase.from("people").select("id").eq("user_id", uid).limit(1)
    const found = q.data?.[0]?.id as string | undefined
    if (found) return found
    const ins = await supabase.from("people").insert({ user_id: uid }).select("id").single()
    if (ins.error) throw ins.error
    return ins.data.id as string
  }, [])

  const load = useCallback(async () => {
    setLoading(true) // <- no limpiamos msg para que no se pierda el link mostrado
    const { data: u } = await supabase.auth.getUser()
    const user = u.user
    if (!user) {
      router.push("/test")
      return
    }
    setUserId(user.id)
    setUserEmail(user.email || "")

    // obtener/crear people.id
    let pid = personId
    try {
      if (!pid) pid = await ensurePerson(user.id)
      setPersonId(pid)
    } catch (e: any) {
      setMsg(`No se pudo obtener/crear persona: ${e?.message ?? e}`)
      setLoading(false)
      return
    }

    // listar referencias del usuario (por owner_id o person_id)
    const orClause = `owner_id.eq.${user.id},person_id.eq.${pid}`
    const { data, error } = await supabase
      .from("references")
      .select("*")
      .or(orClause)
      .order("created_at", { ascending: false })

    if (error) {
      setMsg(error.message)
      setRows([])
    } else {
      setRows(data ?? [])
    }
    setLoading(false)
  }, [ensurePerson, personId, router])

  useEffect(() => {
    load()
  }, [load])

  // --- acciones -------------------------------------------------------------

  const createDraft = async () => {
    setMsg("Creando…")
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return setMsg("No hay sesión")

    let pid = personId
    try {
      if (!pid) pid = await ensurePerson(uid)
      setPersonId(pid)
    } catch (e: any) {
      setMsg(`No se pudo obtener/crear persona: ${e?.message ?? e}`)
      return
    }

    const { data, error } = await supabase
      .from("references")
      .insert([{
        owner_id: uid,
        person_id: pid,
        status: "draft",
        summary: newSummary || null,
        overall_rating: newRating ?? null,
        referrer_name: newRefName || null,
        referrer_email: newRefEmail || null
      }])
      .select("id")
      .single()

    if (error) return setMsg(`Error al crear: ${error.message}`)
    setMsg(`OK: creada ${data?.id}`)
    setNewSummary(""); setNewRating(5); setNewRefName(""); setNewRefEmail("")
    await load()
  }

  const startEdit = (r: Row) => {
    setEditId(r.id)
    setEditSummary(r.summary || "")
    setEditRating(typeof r.overall_rating === "number" ? r.overall_rating : 5)
    setEditRefName(r.referrer_name || "")
    setEditRefEmail(r.referrer_email || "")
  }

  const saveEdit = async () => {
    if (!editId) return
    setMsg("Guardando…")
    const { error } = await supabase
      .from("references")
      .update({
        summary: editSummary,
        overall_rating: editRating,
        referrer_name: editRefName || null,
        referrer_email: editRefEmail || null
      })
      .eq("id", editId)

    if (error) return setMsg(`No se pudo guardar: ${error.message}`)
    setMsg("Cambios guardados")
    setEditId(null); setEditSummary(""); setEditRating(5); setEditRefName(""); setEditRefEmail("")
    await load()
  }

  // DELETE REMOVED: Philosophy "Hidden ≠ erased"
  // Users can hide references (strikethrough), but never permanently erase them
  // Only database administrators can perform hard deletes if absolutely necessary

  const hideReference = async (id: string) => {
    const reason = prompt("Razón para ocultar (opcional):")
    if (reason === null) return // cancelled

    setMsg("Ocultando referencia…")
    try {
      await apiPost(`/api/references/${id}/hide`, { reason })
      setMsg("Referencia ocultada exitosamente")
      await load()
    } catch (err) {
      // Handle feature disabled gracefully (503 Service Unavailable)
      if (err instanceof ApiClientError && err.status === 503) {
        setMsg("⚠️ La función de ocultar referencias está temporalmente deshabilitada. Tus referencias están seguras.")
        return
      }
      const errorMsg = err instanceof ApiClientError
        ? err.message
        : "Error al ocultar la referencia"
      setMsg(`Error: ${errorMsg}`)
    }
  }

  const unhideReference = async (id: string) => {
    if (!confirm("¿Mostrar esta referencia nuevamente?")) return

    setMsg("Mostrando referencia…")
    try {
      await apiPost(`/api/references/${id}/unhide`)
      setMsg("Referencia visible nuevamente")
      await load()
    } catch (err) {
      // Handle feature disabled gracefully (503 Service Unavailable)
      if (err instanceof ApiClientError && err.status === 503) {
        setMsg("⚠️ La función de ocultar referencias está temporalmente deshabilitada. Tus referencias están seguras.")
        return
      }
      const errorMsg = err instanceof ApiClientError
        ? err.message
        : "Error al mostrar la referencia"
      setMsg(`Error: ${errorMsg}`)
    }
  }

  // Tattoo reference on-chain (immutable integrity commitment)
  const tattooReference = async (id: string) => {
    if (!confirm("¿Tatuar esta referencia en blockchain? Esta acción es IRREVERSIBLE. Si el contenido cambia después, la verificación mostrará 'Modificado'.")) return

    setMsg("Tatuando referencia en blockchain…")
    try {
      const result = await apiPost(`/api/references/${id}/tattoo`, {}) as {
        ok: boolean;
        tattoo_tx_hash: string;
        tattoo_chain_id: number;
        tattooed_at: string;
        integrity_status: string;
      }

      const explorerUrl = result.tattoo_chain_id === 8453
        ? `https://basescan.org/tx/${result.tattoo_tx_hash}`
        : `https://sepolia.basescan.org/tx/${result.tattoo_tx_hash}`

      setMsg(`Referencia tatuada exitosamente.\n\nTx: ${result.tattoo_tx_hash}\n\nVer en explorer: ${explorerUrl}`)
      await load()
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 503) {
          setMsg("⚠️ La integración blockchain no está configurada en este entorno.")
          return
        }
        if (err.status === 409) {
          setMsg("ℹ️ Esta referencia ya fue tatuada anteriormente.")
          return
        }
      }
      const errorMsg = err instanceof ApiClientError
        ? err.message
        : "Error al tatuar la referencia"
      setMsg(`Error: ${errorMsg}`)
    }
  }

  // Enviar invitación y pasar a "submitted"
  const sendInvite = async (r: Row) => {
    setMsg("Creando invitación…")
    if (!r.referrer_email) { setMsg("Falta el email del referente."); return }

    const ins = await supabase
      .from("reference_invites")
      .insert([{ reference_id: r.id, referrer_email: r.referrer_email, referrer_name: r.referrer_name || null }])
      .select("token")
      .single()

    if (ins.error) { setMsg(`No se pudo crear la invitación: ${ins.error.message}`); return }
    const token = ins.data?.token as string

    const upd = await supabase.from("references").update({ status: "submitted" }).eq("id", r.id)
    if (upd.error) { setMsg(`Invitación creada, pero no pude cambiar estado: ${upd.error.message}`); return }

    const link = `${window.location.origin}/ref/verify?token=${token}`
    const subject = encodeURIComponent("Invitación para dejar una referencia (HRKey)")
    const body = encodeURIComponent(
      `Hola${r.referrer_name ? " " + r.referrer_name : ""},\n\n` +
      `Te invito a dejar una referencia verificada.\n` +
      `Abrí este link:\n${link}\n\n¡Gracias!`
    )
    const mailto = `mailto:${encodeURIComponent(r.referrer_email)}?subject=${subject}&body=${body}`

    setMsg(`Invitación lista.\nLink:\n${link}\n\nEnviar por email: ${mailto}`)
    await load()
  }

  // Ver el último link de invitación de una referencia ya "submitted"
  const showInviteLink = async (referenceId: string, refEmail?: string, refName?: string) => {
    const { data, error } = await supabase
      .from("reference_invites")
      .select("token, expires_at, status")
      .eq("reference_id", referenceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      setMsg("No hay invitación creada para esta referencia.")
      return
    }

    const link = `${window.location.origin}/ref/verify?token=${data.token}`
    const subject = encodeURIComponent("Invitación para dejar una referencia (HRKey)")
    const body = encodeURIComponent(
      `Hola${refName ? " " + refName : ""},\n\n` +
      `Te invito a dejar una referencia verificada.\n` +
      `Abrí este link:\n${link}\n\n¡Gracias!`
    )
    const mailto = `mailto:${encodeURIComponent(refEmail || "")}?subject=${subject}&body=${body}`

    setMsg(`Link de invitación:\n${link}\n\nEnviar por email: ${mailto}`)
  }

  const signOut = async () => { await supabase.auth.signOut(); router.push("/test") }

  const fmt = (v: any) => {
    try {
      if (!v) return "—"
      const d = new Date(v)
      return isNaN(d.getTime()) ? String(v) : d.toLocaleString()
    } catch {
      return String(v)
    }
  }

  // --- UI -------------------------------------------------------------------

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>HRKey · Dashboard</h1>
          <div style={{ fontSize: 14, opacity: 0.8 }}>
            Sesión: <b>{userEmail}</b>{personId && <> · person_id: <code>{personId}</code></>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load}>Refrescar</button>
          <button onClick={signOut}>Salir</button>
        </div>
      </header>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 12 }}>Nueva referencia</h2>
        <div style={{ display: "grid", gap: 8, maxWidth: 640 }}>
          <input placeholder="Resumen (summary)" value={newSummary} onChange={e => setNewSummary(e.target.value)} />
          <label>Rating (1–5): <input type="number" min={1} max={5} value={newRating} onChange={e => setNewRating(Number(e.target.value))} /></label>
          <input placeholder="Nombre del referente (opcional)" value={newRefName} onChange={e => setNewRefName(e.target.value)} />
          <input placeholder="Email del referente" value={newRefEmail} onChange={e => setNewRefEmail(e.target.value)} />
          <button onClick={createDraft}>Crear borrador</button>
        </div>
      </section>

      {msg && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 8, whiteSpace: "pre-wrap" }}>
          {msg}
        </div>
      )}

      <section style={{ marginTop: 32 }}>
        <h2 style={{ marginBottom: 12 }}>Mis referencias</h2>
        {loading ? (
          <div>Cargando…</div>
        ) : rows.length === 0 ? (
          <div>No tenés referencias aún.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {rows.map((r) => (
              <article key={r.id} style={{
                border: r.is_hidden ? "1px solid #94a3b8" : "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 12,
                backgroundColor: r.is_hidden ? "#f8fafc" : "white"
              }}>
                {r.is_hidden && (
                  <div style={{
                    marginBottom: 12,
                    padding: 8,
                    backgroundColor: "#f1f5f9",
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#475569",
                    borderLeft: "3px solid #94a3b8"
                  }}>
                    ℹ️ Referencia oculta {r.hidden_at && `(desde ${fmt(r.hidden_at)})`}
                    {r.hide_reason && <div style={{ fontSize: 12, marginTop: 4, fontWeight: 400, color: "#64748b" }}>Razón: {r.hide_reason}</div>}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div><div style={{ fontWeight: 600 }}>ID</div><div style={{ fontFamily: "monospace" }}>{r.id}</div></div>
                  <div><div style={{ fontWeight: 600 }}>Estado</div><div>{r.status ?? "—"}</div></div>
                  <div><div style={{ fontWeight: 600 }}>Creado</div><div>{fmt(r.created_at)}</div></div>
                </div>

                {/* Integrity Badge */}
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Integridad:</span>
                  <ReferenceIntegrityBadge
                    status={r.integrity_status || "UNKNOWN"}
                    txHash={r.tattoo_tx_hash}
                    chainId={r.tattoo_chain_id}
                    tattooedAt={r.tattooed_at}
                  />
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Resumen</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{r.summary ?? "—"}</div>
                </div>

                <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><div style={{ fontWeight: 600 }}>Referente</div><div>{r.referrer_name ?? "—"}</div></div>
                  <div><div style={{ fontWeight: 600 }}>Email referente</div><div>{r.referrer_email ?? "—"}</div></div>
                </div>

                {editId === r.id ? (
                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    <textarea rows={4} value={editSummary} onChange={e => setEditSummary(e.target.value)} />
                    <label>Rating (1–5): <input type="number" min={1} max={5} value={editRating} onChange={e => setEditRating(Number(e.target.value))} /></label>
                    <input placeholder="Nombre referente" value={editRefName} onChange={e => setEditRefName(e.target.value)} />
                    <input placeholder="Email referente" value={editRefEmail} onChange={e => setEditRefEmail(e.target.value)} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveEdit}>Guardar</button>
                      <button onClick={() => { setEditId(null); setEditSummary(""); setEditRating(5); setEditRefName(""); setEditRefEmail("") }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {r.status === "draft" && (
                      <button onClick={() => sendInvite(r)}>Enviar a verificación</button>
                    )}
                    {r.status === "submitted" && (
                      <button onClick={() => showInviteLink(r.id, r.referrer_email, r.referrer_name)}>
                        Ver link de invitación
                      </button>
                    )}
                    <button onClick={() => startEdit(r)}>Editar</button>
                    {r.is_hidden ? (
                      <button onClick={() => unhideReference(r.id)} style={{ backgroundColor: "#64748b", color: "white" }}>
                        Mostrar
                      </button>
                    ) : (
                      <button onClick={() => hideReference(r.id)} style={{ backgroundColor: "#64748b", color: "white" }}>
                        Ocultar
                      </button>
                    )}
                    {/* Tattoo button - only show if not hidden and not already tattooed */}
                    {!r.is_hidden && !r.tattoo_tx_hash && (
                      <button
                        onClick={() => tattooReference(r.id)}
                        style={{ backgroundColor: "#7c3aed", color: "white" }}
                        title="Guardar hash de esta referencia en blockchain (irreversible)"
                      >
                        Tatuar en blockchain
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
