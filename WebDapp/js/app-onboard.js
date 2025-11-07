// WebDapp/js/app-onboard.js
(async () => {
  const fromCoupon = sessionStorage.getItem('hrkey_onboard_from_coupon') === '1';
  const profile    = JSON.parse(localStorage.getItem('hrkey_profile') || 'null');
  if (!fromCoupon && profile && profile.name && profile.email) return;

  let modal = document.getElementById('hrkey-onboard-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'hrkey-onboard-modal';
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;";
    modal.innerHTML = `
      <div style="background:#fff;width:min(420px,92%);border-radius:16px;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,.2);">
        <h2 style="margin:0 0 10px">Completar tu perfil</h2>
        <p style="margin:0 0 16px">Solo necesitamos tu nombre y email para activar tu cuenta.</p>
        <form id="hrkey-onboard-form">
          <label style="display:block;margin-bottom:8px">Nombre
            <input id="hrkey_name" required style="width:100%;padding:10px;border:1px solid #ccc;border-radius:10px"/>
          </label>
          <label style="display:block;margin:10px 0 16px">Email
            <input id="hrkey_email" type="email" required style="width:100%;padding:10px;border:1px solid #ccc;border-radius:10px"/>
          </label>
          <button id="hrkey_save" type="submit" style="width:100%;padding:12px;border:0;border-radius:12px;background:#111;color:#fff;font-weight:600;">
            Guardar y continuar
          </button>
        </form>
        <p id="hrkey_msg" style="color:#d00;margin-top:10px;display:none"></p>
      </div>`;
    document.body.appendChild(modal);
  }

  if (profile?.name)  document.getElementById('hrkey_name').value  = profile.name;
  if (profile?.email) document.getElementById('hrkey_email').value = profile.email;

  document.getElementById('hrkey-onboard-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name   = document.getElementById('hrkey_name').value.trim();
    const email  = document.getElementById('hrkey_email').value.trim();
    const coupon = localStorage.getItem('hrkey_coupon') || null;

    try {
      const res = await fetch('/api/users/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ name, email, coupon, source: 'qr' })
      });
      if (!res.ok) throw new Error(await res.text());

      localStorage.setItem('hrkey_profile', JSON.stringify({ name, email }));
      sessionStorage.removeItem('hrkey_onboard_from_coupon');

      document.getElementById('hrkey-onboard-modal').remove();
      if (typeof window.reloadReferences === 'function') {
        await window.reloadReferences();
      } else {
        location.reload();
      }
    } catch (err) {
      const msg = document.getElementById('hrkey_msg');
      msg.style.display = 'block';
      msg.textContent = 'No pudimos guardar tu perfil. Intenta de nuevo.';
      console.error('complete-profile error:', err);
    }
  });
})();
