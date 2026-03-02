"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "../../../lib/supabaseClient"

type InviteRow = {
  reference_id: string
  referrer_email: string | null
  referrer_name: string | null
  expires_at: string | null
  invite_status: string | null
}

function VerifyReferenceContent() {
  const params = useSearchParams()
  const token = params.get("token") || ""

  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState<InviteRow | null>(null)
  const [summary, setSummary] = useState("")
  const [rating, setRating] = useState<number>(5)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setMsg(null)

      if (!token) {
        setMsg("Falta token.")
        setLoading(false)
        return
      }

      // get_invite_by_token retorna una fila; a veces PostgREST lo entrega como array
      const res = await supabase.rpc("get_invite_by_token", { p_token: token })
      if (res.error) {
        setMsg(`Token inválido: ${res.error.message}`)
        setLoading(false)
        return
      }

      const row = Array.isArray(res.data) ? res.data[0] : res.data
      if (!row) {
        setMsg("Invitación no encontrada.")
        setLoading(false)
        return
      }

      const inviteRow = row as InviteRow
      setInvite(inviteRow)

      if ((row as any).invite_status !== "pending") {
        setMsg(`Esta invitación ya no está activa (estado: ${(row as any).invite_status}).`)
      }

      setLoading(false)
    }

    load()
  }, [token])

  const submit = async () => {
    // guard rails: si ya no está activa, no reintentar
    const statusNow = invite?.invite_status ?? "pending"
    const expiresNow = invite?.expires_at ? new Date(invite.expires_at) : null
    const expiredNow = expiresNow ? expiresNow.getTime() < Date.now() : false

    if (expiredNow || statusNow !== "pending") {
      setMsg("Esta invitación ya no está activa (ya fue usada o expiró).")
      // por si el state estaba desfasado, aseguramos que quede bloqueada
      setInvite((prev) => (prev ? { ...prev, invite_status: "completed" } : prev))
      return
    }

    setMsg("Enviando referencia…")

    const { data, error } = await supabase.rpc("submit_reference_by_token", {
      p_token: token,
      p_summary: summary,
      p_rating: rating,
      // p_ip lo omitimos porque la RPC tiene default null
    })

    if (error) {
      setMsg(`No se pudo enviar: ${error.message}`)
      return
    }

    // Si no devolvió filas, significa: token no matcheó / no estaba pending / expiró
    const first = Array.isArray(data) ? data[0] : data
    const referenceId = first?.reference_id

    if (!referenceId) {
      setMsg("Esta invitación ya no está activa (probablemente ya fue usada). Abrí un link nuevo.")
      setInvite((prev) => (prev ? { ...prev, invite_status: "completed" } : prev))
      return
    }

    // Éxito: bloqueamos re-submit sin depender de refresh
    setInvite((prev) => (prev ? { ...prev, invite_status: "completed" } : prev))
    setMsg(`¡Gracias! Referencia verificada. ID: ${referenceId}`)
  }

  if (loading) {
    return <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>Cargando…</div>
  }

  if (!invite) {
    return (
      <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
        <h1>Invitación inválida</h1>
        {msg && <p>{msg}</p>}
      </div>
    )
  }

  const expires = invite.expires_at ? new Date(invite.expires_at) : null
  const expired = expires ? expires.getTime() < Date.now() : false
  const status = invite.invite_status ?? "pending"
  const disabled = expired || status !== "pending"

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1>Dejar una referencia</h1>
      <p>Gracias por ayudar con una referencia verificada.</p>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        <div>
          <b>Para:</b> {invite.referrer_name || "—"}{" "}
          {invite.referrer_email ? `(${invite.referrer_email})` : ""}
        </div>
        <div>
          <b>Vence:</b> {expires ? expires.toLocaleString() : "—"}
        </div>
        <div>
          <b>Estado de invitación:</b> {status}
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        <label>Resumen / Comentario</label>
        <textarea rows={6} value={summary} onChange={(e) => setSummary(e.target.value)} />

        <label>Calificación (1–5)</label>
        <input
          type="number"
          min={1}
          max={5}
          value={rating}
          onChange={(e) => setRating(Math.min(5, Math.max(1, Number(e.target.value))))}
        />

        <button disabled={disabled} onClick={submit}>
          Enviar referencia
        </button>

        {disabled && <div style={{ color: "#b91c1c" }}>Esta invitación no está activa.</div>}
      </div>

      {msg && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 8,
            whiteSpace: "pre-wrap",
          }}
        >
          {msg}
        </div>
      )}
    </div>
  )
}

export default function VerifyReferencePage() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>Cargando…</div>}>
      <VerifyReferenceContent />
    </Suspense>
  )
}
