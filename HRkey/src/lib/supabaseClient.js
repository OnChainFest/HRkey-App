// Frontend supabase client (Next.js)
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Durante build time, usa valores dummy para permitir el build
const isBuildTime = typeof window === 'undefined' && !supabaseUrl;

const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseAnonKey || 'placeholder-key';

if (!isBuildTime && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    "⚠️ Faltan variables NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

// Export **nombrado** porque lo importamos como { supabase }
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

