module.exports = async (req, res) => {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return res.status(500).json({ ok: false, error: 'Missing RESEND_API_KEY' });

    const to = req.query.to || "vicvalch@gmail.com";
    const payload = {
      from: "HRKey Test <onboarding@resend.dev>",
      to: [to],
      subject: "HRKey – Resend test OK ✅",
      html: `<div style="font-family:Arial;padding:20px">
               <h2>HRKey – Resend test OK ✅</h2>
               <p>Todo funciona perfectamente.</p>
             </div>`
    };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return res.status(response.ok ? 200 : 400).json({ ok: response.ok, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
};
