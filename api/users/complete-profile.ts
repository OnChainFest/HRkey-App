// api/users/complete-profile.ts
// Vercel Edge Function: guarda (opcional) en Supabase y avisa (opcional) por correo.
// Si no hay env vars, igual devuelve {success:true} para no bloquear el flujo del fin de semana.

export const config = { runtime: 'edge' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

export default async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

    const { name, email, coupon, source } = await req.json().catch(() => ({} as any));
    if (!name || !email) return json({ error: 'Missing fields' }, 400);

    // ===== 1) Guardar en Supabase (opcional si pones env vars) =====
    // Requiere: SUPABASE_URL + SUPABASE_SERVICE_ROLE (en Vercel → Project Settings → Env Vars)
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;

    if (supabaseUrl && serviceRole) {
      try {
        const r = await fetch(`${supabaseUrl}/rest/v1/onboarding_leads`, {
          method: 'POST',
          headers: {
            'apikey': serviceRole,
            'Authorization': `Bearer ${serviceRole}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            name, email, coupon: coupon || null, source: source || 'qr',
            created_at: new Date().toISOString()
          })
        });
        if (!r.ok) {
          const t = await r.text();
          console.warn('Supabase insert warn:', t);
          // no bloquea al usuario
        }
      } catch (e) {
        console.warn('Supabase insert exception:', e);
      }
    } else {
      // sin env vars, seguimos sin fallar
      console.warn('SUPABASE_URL / SUPABASE_SERVICE_ROLE not set; skipping DB insert');
    }

    // ===== 2) Aviso por correo (opcional con Resend) =====
    // Requiere: RESEND_API_KEY (+ MAIL_FROM sugerido, + ADMIN_EMAIL destinatario)
    const resendKey = process.env.RESEND_API_KEY;
    const adminTo   = process.env.ADMIN_EMAIL;
    if (resendKey && adminTo) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: process.env.MAIL_FROM || 'HRKey <noreply@hrkey.xyz>',
            to: adminTo,
            subject: 'Nuevo onboarding via QR',
            html: `<p><b>Nombre:</b> ${escapeHtml(name)}<br/>
                   <b>Email:</b> ${escapeHtml(email)}<br/>
                   <b>Coupon:</b> ${escapeHtml(coupon || '-') }<br/>
                   <b>Source:</b> ${escapeHtml(source || '-') }</p>`
          })
        });
        if (!r.ok) console.warn('Resend warn:', await r.text());
      } catch (e) {
        console.warn('Resend exception:', e);
      }
    } else {
      console.warn('RESEND_API_KEY / ADMIN_EMAIL not set; skipping email');
    }

    return json({ success: true });
  } catch (e: any) {
    console.error('complete-profile fatal:', e);
    return json({ error: e?.message || 'Unknown error' }, 500);
  }
};

// Pequeño helper para evitar HTML injection en el correo
function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
