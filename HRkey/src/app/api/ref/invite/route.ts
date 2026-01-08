// ============================================================================
// HRKey References Flow V1 - Create Invite API
// ============================================================================
// Description: Creates reference invitations with secure token hashing
// Security: Dev-only or requires shared secret
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================================
// SECURITY: Require service role key
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("❌ Missing Supabase configuration");
}

// Create service role client (bypasses RLS)
const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// ============================================================================
// TYPES
// ============================================================================

interface CreateInviteRequest {
  referrer_email: string;
  referrer_name: string;
  requester_id?: string; // Optional: UUID of candidate requesting reference
  expires_in_hours?: number; // Default: 168 (7 days)
  metadata?: Record<string, unknown>;
}

// ============================================================================
// POST /api/ref/invite
// ============================================================================
// Creates a reference invitation and returns verify URL
// SECURITY: Dev-only OR requires X-Invite-Secret header

export async function POST(request: Request) {
  try {
    // -------------------------------------------------------------------------
    // 1. SECURITY CHECK: Dev-only or secret required
    // -------------------------------------------------------------------------

    const isDevelopment = process.env.NODE_ENV !== "production";
    const inviteSecret = process.env.INVITE_SECRET; // Optional shared secret
    const providedSecret = request.headers.get("X-Invite-Secret");

    // Allow in development OR if secret matches
    if (!isDevelopment && inviteSecret && providedSecret !== inviteSecret) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // -------------------------------------------------------------------------
    // 2. VALIDATE SUPABASE CONFIGURATION
    // -------------------------------------------------------------------------

    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Supabase service role not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env",
        },
        { status: 500 }
      );
    }

    // -------------------------------------------------------------------------
    // 3. PARSE AND VALIDATE REQUEST BODY
    // -------------------------------------------------------------------------

    const body = (await request.json()) as CreateInviteRequest;
    const {
      referrer_email,
      referrer_name,
      requester_id,
      expires_in_hours = 168, // 7 days default
      metadata,
    } = body;

    // Validate required fields
    if (!referrer_email || !referrer_name) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: referrer_email, referrer_name",
        },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(referrer_email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email address" },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // 4. GENERATE SECURE TOKEN
    // -------------------------------------------------------------------------

    // Generate 64-character hex token (256 bits of entropy)
    const token = crypto.randomBytes(32).toString("hex");

    // Hash token with SHA256 (same algorithm as RPC function)
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Optional: Store first 8 chars as prefix for debugging
    const tokenPrefix = token.substring(0, 8);

    // -------------------------------------------------------------------------
    // 5. CALCULATE EXPIRATION
    // -------------------------------------------------------------------------

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expires_in_hours);

    // -------------------------------------------------------------------------
    // 6. INSERT INVITE TO DATABASE
    // -------------------------------------------------------------------------

    const { data: invite, error: insertError } = await supabaseAdmin
      .from("reference_invites")
      .insert({
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        referrer_email,
        referrer_name,
        requester_id: requester_id || null,
        expires_at: expiresAt.toISOString(),
        invite_status: "pending",
        metadata: metadata || null,
      })
      .select("id, expires_at, created_at")
      .single();

    if (insertError) {
      console.error("❌ Error inserting invite:", insertError);
      return NextResponse.json(
        {
          success: false,
          error: `Database error: ${insertError.message}`,
        },
        { status: 500 }
      );
    }

    // -------------------------------------------------------------------------
    // 7. BUILD VERIFY URL
    // -------------------------------------------------------------------------

    // Get base URL from environment
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      "http://localhost:3000";

    const verifyUrl = `${baseUrl}/ref/verify?token=${token}`;

    // -------------------------------------------------------------------------
    // 8. RETURN RESPONSE
    // -------------------------------------------------------------------------

    console.log("✅ Reference invite created successfully");
    console.log(`   Invite ID: ${invite.id}`);
    console.log(`   Referee: ${referrer_name} <${referrer_email}>`);
    console.log(`   Expires: ${expiresAt.toISOString()}`);
    console.log(`   Verify URL: ${verifyUrl}`);

    return NextResponse.json({
      success: true,
      inviteId: invite.id,
      verifyUrl,
      expiresAt: invite.expires_at,
      // SECURITY NOTE: Only return token in development for testing
      ...(isDevelopment && { token }),
    });
  } catch (error: unknown) {
    console.error("❌ Unexpected error creating invite:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// ============================================================================
// OPTIONAL: GET endpoint for testing (dev-only)
// ============================================================================

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    message: "POST to this endpoint to create a reference invite",
    example: {
      method: "POST",
      body: {
        referrer_email: "referee@example.com",
        referrer_name: "John Doe",
        requester_id: "optional-uuid",
        expires_in_hours: 168,
      },
    },
    envVars: {
      SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey ? "✓ Set" : "✗ Missing",
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? "✓ Set" : "✗ Missing",
    },
  });
}
