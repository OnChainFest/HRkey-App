"use client"

import { useState } from "react"
import { supabase } from "../../lib/supabaseClient";

export default function TestAuthPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [msg, setMsg] = useState<string | null>(null)

  const signUp = async () => {
    setMsg(null)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) setMsg(error.message)
    else setMsg(`Usuario creado: ${data.user?.email ?? "verificá tu correo"}`)
  }

  const signIn = async () => {
    setMsg(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMsg(error.message)
    else setMsg(`Sesión iniciada: ${data.user?.email}`)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setMsg("Sesión cerrada")
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1>PeerProof · Test Supabase</h1>
      <input
        type="email"
        placeholder="Correo"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={signUp}>Registrarme</button>
        <button onClick={signIn}>Entrar</button>
        <button onClick={signOut}>Salir</button>
      </div>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  )
}
