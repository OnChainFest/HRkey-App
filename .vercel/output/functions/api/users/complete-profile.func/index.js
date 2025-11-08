// Edge function — /api/users/complete-profile
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

async function sendEmailJS({ serviceId, templateId, publicKey, accessToken, templateParams }) {
  const payload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: templateParams
  };
  if (accessToken) payload.accessToken = accessToken;

  const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return resp;
}

export default async function handler(req) {
  try {
    if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405, { "Allow": "POST" });

    let data = {}; try { data = await req.json(); } catch {}
    const { name, email, coupon, source } = data || {};
    if (!name || !email) return json({ error: "Missing fields" }, 400);

    // 1) (Opcional) Guardar en Supabase
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

    // 2) EmailJS — admin + usuario
    const SERVICE_ID  = process.env.EMAILJS_SERVICE_ID;
    const PUBLIC_KEY  = process.env.EMAILJS_PUBLIC_KEY;
    const ACCESS      = process.env.EMAILJS_ACCESS_TOKEN || undefined;

    const TEMPLATE_ADMIN = process.env.EMAILJS_TEMPLATE_ADMIN_ID;
    const TEMPLATE_USER  = process.env.EMAILJS_TEMPLATE_USER_ID;

    const baseParams = {
      name,
      email,
      coupon: coupon || "",
      source: source || "qr",
      created_at: new Date().toISOString(),
      html_block: `
        <p><b>Nombre:</b> ${escapeHtml(name)}<br/>
           <b>Email:</b> ${escapeHtml(email)}<br/>
           <b>Cupón:</b> ${escapeHtml(coupon || "")}<br/>
           <b>Fuente:</b> ${escapeHtml(source || "qr")}</p>`
    };

    if (SERVICE_ID && PUBLIC_KEY) {
      // a) Admin (si hay template)
      if (TEMPLATE_ADMIN) {
        try {
          const r1 = await sendEmailJS({
            serviceId: SERVICE_ID,
            templateId: TEMPLATE_ADMIN,
            publicKey: PUBLIC_KEY,
            accessToken: ACCESS,
            templateParams: baseParams
          });
          if (!r1.ok) console.warn("EmailJS admin warn:", r1.status, await r1.text().catch(()=> ""));
        } catch (e) { console.warn("EmailJS admin exception:", e); }
      }

      // b) Usuario (si hay template)
      if (TEMPLATE_USER) {
        try {
          const r2 = await sendEmailJS({
            serviceId: SERVICE_ID,
            templateId: TEMPLATE_USER,
            publicKey: PUBLIC_KEY,
            accessToken: ACCESS,
            templateParams: baseParams
          });
          if (!r2.ok) console.warn("EmailJS user warn:", r2.status, await r2.text().catch(()=> ""));
        } catch (e) { console.warn("EmailJS user exception:", e); }
      }
    } else {
      console.warn("EmailJS env vars missing: EMAILJS_SERVICE_ID / EMAILJS_PUBLIC_KEY");
    }

    return json({ success: true });
  } catch (err) {
    console.error("complete-profile error:", err);
    return json({ error: "Internal error" }, 500);
  }
}
