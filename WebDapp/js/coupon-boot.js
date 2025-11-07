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
})();

// --- HOTFIX SOLO SI HAY CUPÓN ---
const __coupon = localStorage.getItem('hrkey_coupon');
if (__coupon) {
  document.addEventListener("submit", (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.handleSignup === "function") {
        Promise.resolve(window.handleSignup(e)).finally(() => { window.location.assign("/app"); });
      } else {
        window.location.assign("/app");
      }
    } catch (err) {
      console.error("coupon hotfix submit error:", err);
      window.location.assign("/app");
    }
  }, true);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button, [role='button']");
    if (!btn) return;
    const text = (btn.textContent || "").toLowerCase();
    if (text.includes("create free account") || text.includes("create account") || text.includes("sign up")) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.handleSignup === "function") {
        Promise.resolve(window.handleSignup(e)).finally(() => window.location.assign("/app"));
      } else {
        window.location.assign("/app");
      }
    }
  }, true);
}
