// Frontend supabase client (Next.js)
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function notConfiguredError() {
  return new Error(
    "Supabase no está configurado. Seteá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local"
  );
}

// Export **nombrado** porque lo importamos como { supabase }
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : {
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          getUser: async () => ({ data: { user: null }, error: null }),
          signOut: async () => ({ error: null }),
          onAuthStateChange: () => ({
            data: { subscription: { unsubscribe: () => {} } },
          }),
          signUp: async () => {
            throw notConfiguredError();
          },
          signInWithPassword: async () => {
            throw notConfiguredError();
          },
        },
        from: () => {
          throw notConfiguredError();
        },
        rpc: () => {
          throw notConfiguredError();
        },
      };
