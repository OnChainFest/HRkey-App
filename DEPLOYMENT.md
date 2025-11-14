# Guía de Deployment - HRKey App

## 📋 Requisitos Previos

1. Cuenta en [Vercel](https://vercel.com) (para frontend Next.js)
2. Cuenta en [Supabase](https://supabase.com) (base de datos)
3. Cuenta en [Resend](https://resend.com) (emails)
4. Cuenta en [Stripe](https://stripe.com) (pagos)
5. API Key de [Coinbase Developer Platform](https://www.coinbase.com/cloud) (CDP)
6. RPC endpoint para Base Sepolia (puedes usar [Alchemy](https://www.alchemy.com/) o public RPC)

---

## 🚀 Parte 1: Deploy del Frontend (Next.js en Vercel)

### Opción A: Deploy desde GitHub (Recomendado)

1. **Conecta tu repositorio a Vercel:**
   ```bash
   # Asegúrate de tener los cambios pusheados
   git push origin claude/production-build-review-01Hc528yjZ6KeWKvkoUH4SFp
   ```

2. **En Vercel Dashboard:**
   - Ve a https://vercel.com/new
   - Importa tu repositorio de GitHub: `OnChainFest/HRkey-App`
   - Configure el proyecto:
     - **Framework Preset:** Next.js
     - **Root Directory:** `HRkey`
     - **Build Command:** `npm run build` (dejarlo por defecto)
     - **Output Directory:** `.next` (dejarlo por defecto)
     - **Install Command:** `npm install` (dejarlo por defecto)

3. **Configura las Variables de Entorno en Vercel:**

### Opción B: Deploy desde CLI

```bash
# Instalar Vercel CLI si no lo tienes
npm install -g vercel

# Desde el directorio HRkey
cd /home/user/HRkey-App/HRkey

# Deploy a producción
vercel --prod
```

---

## 🔐 Variables de Entorno Requeridas

### Para el Frontend Next.js (Vercel)

Configura estas variables en: **Vercel Dashboard → Project Settings → Environment Variables**

```bash
# Supabase (Público - safe para cliente)
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui

# Supabase Service Role (Privado - solo para API Routes)
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui

# Coinbase Developer Platform
NEXT_PUBLIC_CDP_API_KEY=tu-cdp-api-key

# Blockchain (Base Sepolia)
NEXT_PUBLIC_CONTRACT_ADDRESS=0xTuContractAddressAqui
NEXT_PUBLIC_BASE_SEPOLIA_ID=84532

# App URL (Vercel lo configura automáticamente, pero puedes sobreescribir)
NEXT_PUBLIC_APP_URL=https://tu-dominio.vercel.app

# Resend (para emails desde API routes)
RESEND_API_KEY=re_tu_api_key_aqui
DIGEST_TO_EMAIL=tu-email@ejemplo.com
DIGEST_FROM_EMAIL=HRKey <no-reply@tu-dominio.com>

# Stripe (para pagos)
STRIPE_SECRET_KEY=sk_test_tu_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_tu_webhook_secret
PRICE_ID_LIFETIME=price_tu_price_id_aqui

# Supabase URL (para API routes que lo necesiten)
SUPABASE_URL=https://tu-proyecto.supabase.co
```

### Obtener las Variables de Entorno:

**Supabase:**
1. Ve a tu proyecto en https://app.supabase.com
2. Settings → API
3. Copia `Project URL` y `anon public` key
4. Para `service_role` key: Settings → API → service_role (⚠️ mantén esto secreto)

**Coinbase CDP:**
1. Ve a https://portal.cdp.coinbase.com/
2. Crea un API Key
3. Copia la key generada

**Resend:**
1. Ve a https://resend.com/api-keys
2. Crea una API Key
3. Copia la key

**Stripe:**
1. Ve a https://dashboard.stripe.com/test/apikeys
2. Copia tu Secret Key
3. Para webhooks: Developers → Webhooks → Add endpoint
4. URL: `https://tu-dominio.vercel.app/api/stripe/webhook`

---

## 🖥️ Parte 2: Deploy del Backend (Opcional)

El backend Express se puede deployar en:

### Opción 1: Vercel (Serverless)

```bash
cd /home/user/HRkey-App/backend

# Deploy
vercel --prod
```

### Opción 2: Railway / Render

1. **En Railway.app:**
   - New Project → Deploy from GitHub
   - Selecciona tu repo
   - Root Directory: `backend`
   - Start Command: `npm start`

2. **Variables de entorno para backend:**
```bash
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
STRIPE_SECRET_KEY=sk_test_tu_stripe_key
PORT=3000
```

---

## 📦 Parte 3: Verificación Post-Deploy

### 1. Verifica que el build esté funcionando:
```bash
# Localmente primero
cd /home/user/HRkey-App/HRkey
npm run build
npm start

# Abre http://localhost:3000
```

### 2. Verifica las rutas principales:
- ✅ `/` - Homepage
- ✅ `/dashboard` - Dashboard de referencias
- ✅ `/ref/verify?token=xxx` - Verificación de referencias
- ✅ `/ping` - Health check

### 3. Verifica las API Routes:
- ✅ `POST /api/invite` - Crear invitaciones
- ✅ `POST /api/kpi-suggestions` - Guardar KPIs
- ✅ `GET /api/kpi-digest` - Digest diario (cron)

### 4. Configura el Webhook de Stripe:

En Stripe Dashboard:
1. Developers → Webhooks → Add endpoint
2. URL: `https://tu-dominio.vercel.app/api/stripe/webhook`
3. Events: `checkout.session.completed`, `payment_intent.succeeded`
4. Copia el Webhook Secret y actualiza `STRIPE_WEBHOOK_SECRET` en Vercel

---

## 🔄 Parte 4: Configurar CI/CD (Automático con Vercel)

Vercel automáticamente:
- ✅ Hace deploy en cada push a tu branch principal
- ✅ Crea preview deployments para cada PR
- ✅ Ejecuta el build y verifica que compile correctamente

### Para configurar branch de producción:

1. Ve a: Vercel Dashboard → Project Settings → Git
2. **Production Branch:** Cambia a tu branch principal (ej: `main` o `master`)
3. Los push a esa branch se deployarán automáticamente a producción

---

## 📊 Parte 5: Monitoreo y Logs

### Ver logs en Vercel:
1. Ve a tu proyecto en Vercel Dashboard
2. Deployments → Click en el deployment más reciente
3. Pestaña "Logs" para ver errores en tiempo real

### Analytics:
- Vercel Analytics: Automáticamente habilitado
- Supabase Analytics: Ve a tu proyecto → Reports

---

## 🔧 Troubleshooting

### Error: "Cannot find module '@/utils/appURL'"
✅ **Ya corregido** - Creamos el archivo en el commit anterior

### Error: "SUPABASE_URL is not defined"
- Verifica que todas las variables de entorno estén configuradas en Vercel
- Recarga el deployment después de agregar variables

### Error: Build fails en Vercel
- Verifica que el directorio root sea `HRkey`
- Asegúrate que `npm run build` funcione localmente primero

### Error: "Turbopack warning about multiple lockfiles"
- Esto es solo un warning, no afecta el build
- Para silenciarlo, agrega `turbopack.root` en `next.config.js`

---

## ✨ Parte 6: Optimizaciones Post-Deploy

### 1. Configurar Dominio Personalizado

En Vercel:
1. Settings → Domains
2. Agrega tu dominio (ej: `hrkey.xyz`)
3. Configura los DNS records según las instrucciones

### 2. Habilitar Analytics

```bash
# En tu proyecto
npm install @vercel/analytics

# En app/layout.tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

### 3. Configurar Cron Jobs para el Digest

En Vercel (con cron jobs):
```json
// vercel.json
{
  "crons": [{
    "path": "/api/kpi-digest",
    "schedule": "0 9 * * *"
  }]
}
```

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs en Vercel Dashboard
2. Verifica que todas las variables de entorno estén configuradas
3. Asegúrate que el build funcione localmente primero

---

## ✅ Checklist Final

Antes de ir a producción:

- [ ] Todas las variables de entorno configuradas en Vercel
- [ ] Build exitoso en Vercel
- [ ] Dominio personalizado configurado (opcional)
- [ ] Stripe webhook configurado
- [ ] Supabase database migrations aplicadas
- [ ] Contratos inteligentes deployados en Base Sepolia
- [ ] Tests básicos ejecutados
- [ ] Monitoring y analytics habilitados

---

🎉 **¡Listo! Tu aplicación HRKey está en producción.**
