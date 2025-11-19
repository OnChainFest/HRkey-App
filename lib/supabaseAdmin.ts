// Centraliza el cliente SERVICE ROLE para APIs del backend
import { createClient } from '@supabase/supabase-js';

// Validate that we have the SERVICE ROLE key, not ANON key
if (!process.env.SUPABASE_SERVICE_ROLE) {
  console.error('❌ SUPABASE_SERVICE_ROLE is not configured!');
  console.error('Note: SUPABASE_ANON_KEY is NOT sufficient for admin operations.');
  console.error('You need to add SUPABASE_SERVICE_ROLE to your Vercel environment variables.');
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE || ''
);
