# HRKey — Referral Loop + Stripe Annual Integration

## 1) Qué incluye
- `/pages/api/checkout.ts` — Crea sesión de Checkout anual ($9.99) y respeta `trial_end` según `subscription_expires_at`.
- `/pages/api/webhook.ts` — Webhook que sincroniza fechas de suscripción en Supabase.
- `/pages/api/portal.ts` — (Opcional) Acceso al Billing Portal.
- `/lib/supabaseAdmin.ts` — Cliente service role centralizado.
- `/components/ReferralDashboard.tsx` — UI mínima con link de referral y botón de renovación.
- `/sql/seed_hrkey_referrals.sql` — Tablas base + trigger para sumar +1 mes por referral confirmado.
- `/.env.local.example` — Plantilla de variables.

## 2) Variables de entorno (Vercel → Settings → Environment Variables)
```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
PRICE_ID_ANNUAL=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE=service-role-jwt
```

## 3) Stripe
- Product: HRKey PRO Annual ($9.99/year) → copia el `price_...` en `PRICE_ID_ANNUAL`.
- Webhook: Endpoint `/api/webhook` con eventos: 
  `checkout.session.completed`, `customer.subscription.created`, 
  `customer.subscription.updated`, `customer.subscription.deleted`.

## 4) Supabase
Ejecuta `/sql/seed_hrkey_referrals.sql` en el SQL Editor.
Asegurá que `users` y Auth estén mapeados (id/email).

## 5) Integración UI
Importa el dashboard en tu página de cuenta:
```tsx
import dynamic from 'next/dynamic';
const ReferralDashboard = dynamic(() => import('@/components/ReferralDashboard'), { ssr: false });

// dentro del componente de cuenta
<ReferralDashboard user={userDataFromSupabase} />
```

## 6) Flujo
- Año gratis por promo → `subscription_expires_at = now() + 12 months`.
- Cada referral confirmado → `+1 month` (trigger).
- Al expirar → Checkout de $9.99/año (o suscripción con trial_end si aún queda tiempo).
