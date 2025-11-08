// api/_lib/promos.js
// Ventanas: 48h para BLOCKCHAINJUNGLE (grant 100% fuera de Stripe)
//           7 días para HRKEY50 (50% vía promotion code de Stripe)
const now = () => new Date();
const addHours = (h) => new Date(Date.now() + h * 3600 * 1000);
const addDays  = (d) => new Date(Date.now() + d * 86400 * 1000);

export const PROMOS = {
  HRKEY50: {
    type: "stripe",              // descuento gestionado por Stripe
    stripe_code: "HRKEY50",
    starts_at: now(),
    ends_at: addDays(7)
  },
  BLOCKCHAINJUNGLE: {
    type: "free_grant",          // activación gratis sin pasar por Stripe
    starts_at: now(),
    ends_at: addHours(48)
  }
};

export function isActive(promo) {
  const t = now();
  return (!promo.starts_at || t >= promo.starts_at) &&
         (!promo.ends_at   || t <= promo.ends_at);
}
