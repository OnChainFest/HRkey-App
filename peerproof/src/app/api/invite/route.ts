import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only
);

export async function POST(req: NextRequest) {
  try {
    const { email, name, days = 7 } = await req.json();

    const token = randomUUID();
    const reference_id = randomUUID(); // <- GENERAMOS EL reference_id AQUÍ
    const expires_at = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin
      .from("reference_invites")
      .insert({
        token,
        reference_id,             // <- LO ENVIAMOS EN EL INSERT
        referrer_email: email || null,
        referrer_name: name || null,
        invite_status: "pending",
        expires_at,
      });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const verifyUrl = `${baseUrl}/ref/verify?token=${token}`;

    return NextResponse.json({ token, reference_id, verifyUrl, expires_at });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Bad request" }, { status: 400 });
  }
}
