// Centraliza el cliente SERVICE ROLE para APIs del backend
import { createClient } from '@supabase/supabase-js';

// Support both SUPABASE_SERVICE_ROLE and SUPABASE_SERVICE_ROLE_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate that we have the SERVICE ROLE key, not ANON key
if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY is not configured!');
  console.error('Note: SUPABASE_ANON_KEY is NOT sufficient for admin operations.');
  console.error('You need to add SUPABASE_SERVICE_ROLE_KEY to your Vercel environment variables.');
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  SERVICE_ROLE_KEY || ''
);
