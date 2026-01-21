// api/kpi-suggestions.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Lazy Supabase client initialization
 * Prevents build-time errors by initializing only when called
 */
function getSupabaseClient(): SupabaseClient {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, supabaseKey);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, error: 'Method not allowed' });
  }

  try {
    // Initialize Supabase client inside handler (not at module scope)
    const supabase = getSupabaseClient();

    const { kpis, position, company, userEmail } = req.body || {};
    if (!Array.isArray(kpis) || kpis.length === 0) {
      return res.status(400).json({ ok:false, error: 'No KPIs provided' });
    }

    const rows = kpis
      .map(k => ({
        title: String(k?.title || '').trim(),
        description: String(k?.description || '').trim(),
        position_hint: String(position || '').trim(),
        company_hint: String(company || '').trim(),
        user_email: String(userEmail || '').trim()
      }))
      .filter(r => r.title && r.description);

    if (!rows.length) {
      return res.status(400).json({ ok:false, error: 'Empty KPI payload' });
    }

    const { error } = await supabase
      .from('kpi_suggestions')
      .insert(rows);

    if (error) throw error;

    return res.status(200).json({ ok:true, count: rows.length });
  } catch (e:any) {
    console.error('kpi-suggestions error:', e);
    return res.status(500).json({ ok:false, error: e.message });
  }
}
