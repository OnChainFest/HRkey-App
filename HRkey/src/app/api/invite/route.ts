// src/app/api/invite/route.ts
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { makeRefereeLink } from "@/utils/appURL";
import crypto from "crypto";

/**
 * Lazy Supabase client initialization for API routes
 * Prevents build-time errors by initializing only when called
 */
function getSupabaseClient(): SupabaseClient {
  // Priority 1: Server-side env vars (recommended for API routes)
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "Missing Supabase URL. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in Vercel environment variables."
    );
  }

  if (!supabaseKey) {
    throw new Error(
      "Missing Supabase Key. Set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel environment variables."
    );
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(request: Request) {
  try {
    // Initialize Supabase client inside handler (not at module scope)
    const supabase = getSupabaseClient();

    const body = await request.json();
    const { userId, email, name, applicantData } = body;

    if (!userId || !email || !name) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate a 256-bit cryptographically random token (plaintext, used only
    // for the verification URL and never persisted in plaintext).
    const token = crypto.randomBytes(32).toString("hex");

    // Persist only the SHA-256 hash of the token.
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const { data: invite, error: inviteError } = await supabase
      .from("reference_invites")
      .insert([
        {
          requester_id: userId,
          referee_email: email,
          referee_name: name,
          token_hash: tokenHash,
          status: "pending",
          metadata: applicantData || {},
          created_at: new Date().toISOString(),
        },
      ])
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
      inviteId: invite.id,
      verifyUrl,
    });
  } catch (error: any) {
    console.error("❌ Error creating invite:", error);

    // Return user-friendly error for missing env vars
    const errorMessage =
      error.message?.includes("Supabase") ||
      error.message?.includes("supabaseUrl")
        ? `Configuration error: ${error.message}`
        : error.message;

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
