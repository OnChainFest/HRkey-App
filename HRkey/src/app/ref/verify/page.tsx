"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { apiGet, apiPost, ApiClientError } from "../../../lib/apiClient"

type InviteRow = {
  referee_email: string | null
  referee_name: string | null
  expires_at: string | null
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
        setMsg("This invite link is invalid or expired.")
        setLoading(false)
        return
      }

      try {
        const res = await apiGet<{ success: boolean; invite: InviteRow }>(`/api/reference/by-token/${encodeURIComponent(token)}`, {
          auth: false,
        })

        setInvite(res.invite)
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 429) {
          setMsg("Too many attempts. Please try again later.")
        } else {
          setMsg("This invite link is invalid or expired.")
        }
        setLoading(false)
        return
      }

      setLoading(false)
    }

    load()
  }, [token])

  const submit = async () => {
    const expiresNow = invite?.expires_at ? new Date(invite.expires_at) : null
    const expiredNow = expiresNow ? expiresNow.getTime() < Date.now() : false

    if (expiredNow) {
      setMsg("This invite link is invalid or expired.")
      return
    }

    setMsg("Submitting reference…")

    try {
      const response = await apiPost<{ ok: boolean }>(
        `/api/references/respond/${encodeURIComponent(token)}`,
        {
          ratings: { overall: rating },
          comments: {
            recommendation: summary,
          },
        },
        { auth: false }
      )

      if (response.ok) {
        setMsg("Thank you. Your reference was submitted successfully.")
      } else {
        setMsg("This invite link is invalid or expired.")
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 429) {
        setMsg("Too many attempts. Please try again later.")
        return
      }

      setMsg("This invite link is invalid or expired.")
    }
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
  const disabled = expired

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1>Dejar una referencia</h1>
      <p>Gracias por ayudar con una referencia verificada.</p>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        <div>
          <b>Para:</b> {invite.referee_name || "—"}{" "}
          {invite.referee_email ? `(${invite.referee_email})` : ""}
        </div>
        <div>
          <b>Vence:</b> {expires ? expires.toLocaleString() : "—"}
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
