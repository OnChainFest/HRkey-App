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
