// api/kpi-digest.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TO_EMAIL = process.env.DIGEST_TO_EMAIL || 'vicvalch@hrkey.xyz';
const EMAILJS_SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_DIGEST = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_DIGEST;
const EMAILJS_PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

function todayRangeLocalTZ(tz: string) {
  // Construye el rango [inicio,hoy_fin) en tz local (Costa Rica en tu caso)
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' });
  const parts = fmt.formatToParts(now).reduce((a, p) => {
    a[p.type] = p.value;
    return a;
  }, {} as Record<string, string>);
  const y = parts.year, m = parts.month, d = parts.day;
  const start = new Date(`${y}-${m}-${d}T00:00:00-06:00`); // CR -06:00
  const end   = new Date(`${y}-${m}-${d}T23:59:59-06:00`);
  return { y, m, d, start, end };
}

function escapeHtml(s:string) {
  const map: Record<string, string> = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  return String(s).replace(/[&<>"']/g, (m) => map[m] || m);
}

interface KPIItem {
  title: string;
  description: string;
  position_hint?: string;
  user_email?: string;
  created_at: string;
}

function buildHtml(items: KPIItem[]) {
  const rows = items.map((it, i) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${i+1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">
        <strong>${escapeHtml(it.title)}</strong><br>
        <span style="color:#475569">${escapeHtml(it.description)}</span>
      </td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(it.position_hint||'')}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(it.user_email||'')}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${new Date(it.created_at).toLocaleString('en-US',{ timeZone:'America/Costa_Rica'})}</td>
    </tr>
  `).join('');

  return `
  <div style="font-family:Rubik,Arial,sans-serif;color:#0f172a;">
    <h2 style="margin:0 0 8px;">HRKey — KPI Suggestions (Daily Digest)</h2>
    <p style="margin:0 0 16px;color:#475569;">Below are KPIs added by users today.</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #e2e8f0;">#</th>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #e2e8f0;">KPI</th>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #e2e8f0;">Role Hint</th>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #e2e8f0;">User</th>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #e2e8f0;">Created</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="5" style="padding:12px;color:#64748b;">No items today</td></tr>`}</tbody>
    </table>
  </div>`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Opcional: proteger con una secret si quieres (x-cron-secret)
  try {
    const { y, m, d, start, end } = todayRangeLocalTZ('America/Costa_Rica');

    const { data, error } = await supabase
      .from('kpi_suggestions')
      .select('*')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;

    const html = buildHtml(data || []);
    const subject = `HRKey KPI Digest — ${y}-${m}-${d} (CR) — ${data?.length || 0} item(s)`;

    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_DIGEST || !EMAILJS_PUBLIC_KEY) {
      console.warn('EmailJS not configured — skipping email send');
      return res.status(200).json({ ok:true, count: data?.length || 0, emailSkipped:true });
    }

    // Send via EmailJS REST API
    const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_DIGEST,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: TO_EMAIL,
          subject,
          html_content: html,
          date: `${y}-${m}-${d}`,
          count: data?.length || 0,
        },
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.text();
      throw new Error(`EmailJS error: ${error}`);
    }

    return res.status(200).json({ ok:true, count: data?.length || 0 });
  } catch (e: unknown) {
    console.error('kpi-digest error:', e);
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return res.status(500).json({ ok:false, error: errorMessage });
  }
}
