"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Row = {
  id: string;
  address: string | null;
  cid: string | null;
  tx_hash: string | null;
  created_at: string;
};

export default function ReferencesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("references")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) setErr(error.message);
      else setRows((data ?? []) as Row[]);
    })();
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">References</h1>
      {err && <p className="text-red-600">Error: {err}</p>}
      {!err && rows.length === 0 && <p>Sin datos.</p>}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="border rounded p-3 text-sm">
            <div><b>Address:</b> {r.address ?? "—"}</div>
            <div><b>CID:</b> {r.cid ?? "—"}</div>
            <div>
              <b>Tx:</b>{" "}
              {r.tx_hash ? (
                <a
                  className="underline"
                  href={`https://sepolia.basescan.org/tx/${r.tx_hash}`}
                  target="_blank"
                >
                  {r.tx_hash.slice(0, 12)}…
                </a>
              ) : "—"}
            </div>
            <div><b>At:</b> {new Date(r.created_at).toLocaleString()}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
