"use client";
import { useState } from "react";

export default function InvitesPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState(7);
  const [link, setLink] = useState("");

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setLink("");
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, days }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Error creando invitación");
    setLink(data.verifyUrl);
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Crear invitación</h1>
      <form onSubmit={createInvite} className="grid gap-3">
        <label>Email del referente (opcional)</label>
        <input className="border rounded p-2" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label>Nombre del referente (opcional)</label>
        <input className="border rounded p-2" value={name} onChange={(e) => setName(e.target.value)} />

        <label>Días de validez</label>
        <input
          type="number"
          className="border rounded p-2"
          value={days}
          min={1}
          max={60}
          onChange={(e) => setDays(Number(e.target.value))}
        />

        <button className="px-4 py-2 rounded-xl border shadow w-fit">Generar link</button>
      </form>

      {link && (
        <div className="mt-4 p-3 border rounded">
          <div className="font-medium">Link de verificación</div>
          <a className="underline break-all" href={link} target="_blank" rel="noreferrer">
            {link}
          </a>
        </div>
      )}
    </div>
  );
}
