// src/app/api/invite/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { makeRefereeLink } from "@/utils/appURL"; // 👈 importar desde el módulo seguro
import crypto from "crypto";

// Build-safe: lazy initialization to avoid build-time errors when env vars missing
let supabaseInstance: ReturnType<typeof createClient> | null = null;
function getSupabase(): ReturnType<typeof createClient> {
  if (!supabaseInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Supabase configuration missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required');
    }
    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, email, name, applicantData } = body;

    if (!userId || !email || !name) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generar token único
    const token = crypto.randomBytes(32).toString("hex");

    // Crear invitación en la base de datos
    const { data: invite, error: inviteError } = await getSupabase()
      .from("reference_invites")
      .insert([
        {
          requester_id: userId,
          referee_email: email,
          referee_name: name,
          invite_token: token,
          status: "pending",
          metadata: applicantData || {},
          created_at: new Date().toISOString(),
        },
      ] as any)
      .select()
      .single();

    if (inviteError) throw inviteError;

    // ✅ Construcción segura del link sin localhost
    const verifyUrl = makeRefereeLink(token);

    // TODO: Aquí podrías enviar el correo real con Resend (si no lo haces en backend)
    console.log(`📨 Reference invite created for ${email}`);
    console.log(`🔗 Verification link: ${verifyUrl}`);

    return NextResponse.json({
      success: true,
      inviteId: (invite as any).id,
      verifyUrl,
    });
  } catch (error: any) {
    console.error("❌ Error creating invite:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

