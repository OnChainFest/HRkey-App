function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export default async function handler(req) {
  try {
    if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    let data = {};
    try { data = await req.json(); } catch {}
    const { name, email, coupon, source } = data || {};
    if (!name || !email) return json({ error: 'Missing fields' }, 400);

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
        if (!r.ok) console.warn('Supabase insert warn:', await r.text());
      } catch (e) { console.warn('Supabase insert exception:', e); }
    }

    const resendKey = process.env.RESEND_API_KEY;
    const adminTo   = process.env.ADMIN_EMAIL;
    if (resendKey && adminTo) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
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
      } catch (e) { console.warn('Resend exception:', e); }
    }

    return json({ success: true });
  } catch (e) {
    console.error('complete-profile fatal:', e);
    return json({ error: e?.message || 'Unknown error' }, 500);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
