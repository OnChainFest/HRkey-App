// api/kpi-suggestions.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role para inserts desde backend
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, error: 'Method not allowed' });
  }

  try {
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
