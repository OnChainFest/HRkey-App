// coupon-boot.js: corre en /auth y /auth?coupon=...
(() => {
  try {
    const params = new URLSearchParams(location.search);
    const coupon = params.get('coupon') || params.get('promo');
    if (coupon) {
      localStorage.setItem('hrkey_coupon', coupon);
      document.documentElement.setAttribute('data-coupon', coupon);
      // Canonicaliza a /auth (misma página/JS, sin query)
      history.replaceState({}, "", "/auth");
    }
  } catch (e) {
    console.error("coupon-boot error:", e);
  }

  // === Solo activar lógica si hay cupón guardado ===
  const hasCoupon = !!localStorage.getItem('hrkey_coupon');
  if (!hasCoupon) return;

  // ===== Helpers =====
  const forceToApp = () => {
    try { history.replaceState({}, "", "/auth"); } catch (_) {}
    // Evita loops: redirige una sola vez por pestaña
    if (!sessionStorage.getItem('hrkey_redirected')) {
      sessionStorage.setItem('hrkey_redirected', '1');
      sessionStorage.setItem('hrkey_onboard_from_coupon','1');
window.location.assign("/app");
    }
  };

  // Intercepta SUBMIT del formulario (evita reload)
  const hookForm = () => {
    const form = document.querySelector("form");
    if (form && !form.__hrkey_hooked) {
      form.__hrkey_hooked = true;
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Si existe handler de app, llámalo; después, pase lo que pase, vamos a /app
        if (typeof window.handleSignup === "function") {
          Promise.resolve(window.handleSignup(e)).finally(forceToApp);
        } else {
          forceToApp();
        }
      }, true);
    }
  };

  // Intercepta CLICK en botón principal (por si no dispara submit)
  const hookButton = () => {
    const btn = document.querySelector(
      "button[type='submit'], #create-free-account, button, [role='button']"
    );
    if (btn && !btn.__hrkey_hooked) {
      btn.__hrkey_hooked = true;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.handleSignup === "function") {
          Promise.resolve(window.handleSignup(e)).finally(forceToApp);
        } else {
          forceToApp();
        }
      }, true);
    }
  };

  // Engancha ahora y reintenta varias veces por si el DOM cambia
  const init = () => { hookForm(); hookButton(); };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
  let tries = 0;
  const iv = setInterval(() => {
    tries++;
    init();
    if (tries > 12) clearInterval(iv);
  }, 300);

  // Failsafe: si, a pesar de todo, seguimos en /auth, saltar a /app tras un breve delay
  if (location.pathname === "/auth") {
    setTimeout(() => {
      if (location.pathname === "/auth") forceToApp();
    }, 800);
  }
})();
