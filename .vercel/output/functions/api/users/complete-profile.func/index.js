// Edge function (Output v3) — /api/users/complete-profile
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra }
  });
}
function escapeHtml(s = "") {
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
                  .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
export default async function handler(req) {
  try {
    if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405, { "Allow": "POST" });

    let data = {}; try { data = await req.json(); } catch {}
    const { name, email, coupon, source } = data || {};
    if (!name || !email) return json({ error: "Missing fields" }, 400);

    // 1) Supabase opcional
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
    if (supabaseUrl && serviceRole) {
      try {
        const r = await fetch(`${supabaseUrl}/rest/v1/onboarding_leads`, {
          method: "POST",
          headers: {
            "apikey": serviceRole,
            "Authorization": `Bearer ${serviceRole}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            name, email, coupon: coupon || null, source: source || "qr",
            created_at: new Date().toISOString()
          })
        });
        if (!r.ok) console.warn("Supabase insert warn:", await r.text());
      } catch (e) { console.warn("Supabase insert exception:", e); }
    }

    // 2) EmailJS (consolidado)
    const SERVICE_ID   = process.env.EMAILJS_SERVICE_ID;
    const TEMPLATE_ID  = process.env.EMAILJS_TEMPLATE_ID;
    const PUBLIC_KEY   = process.env.EMAILJS_PUBLIC_KEY;     // user_id
    const ACCESS_TOKEN = process.env.EMAILJS_ACCESS_TOKEN;   // opcional

    if (SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY) {
      const payload = {
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY,
        template_params: {
          name, email,
          coupon: coupon || "",
          source: source || "qr",
          created_at: new Date().toISOString(),
          html_block: `<p><b>Nombre:</b> ${escapeHtml(name)}<br/>
                       <b>Email:</b> ${escapeHtml(email)}<br/>
                       <b>Cupón:</b> ${escapeHtml(coupon || "")}<br/>
                       <b>Fuente:</b> ${escapeHtml(source || "qr")}</p>`
        }
      };
      if (ACCESS_TOKEN) payload.accessToken = ACCESS_TOKEN;

      try {
        const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          console.warn("EmailJS warn:", resp.status, txt);
        }
      } catch (e) {
        console.warn("EmailJS exception:", e);
      }
    } else {
      console.warn("EmailJS env vars missing: EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_PUBLIC_KEY");
    }

    return json({ success: true });
  } catch (err) {
    console.error("complete-profile error:", err);
    return json({ error: "Internal error" }, 500);
  }
}
