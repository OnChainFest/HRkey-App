# Configuración de Stripe para HRKey ($0.50)

## 🚀 Guía Rápida de Configuración

### Paso 1: Crear Producto en Stripe Dashboard

1. Ve a https://dashboard.stripe.com/products
2. Click **"Add Product"**
3. Configura:
   - **Name**: `HRKey PRO Upgrade`
   - **Description**: `Unlock unlimited references, blockchain publishing, and more`
   - **Pricing model**: One time
   - **Price**: `0.50 USD`
4. Click **"Save product"**
5. **COPIA EL PRICE ID** - aparece como `price_...` (ejemplo: `price_1QAbCdEfGh123456`)

### Paso 2: Obtener Secret Key de Stripe

1. Ve a https://dashboard.stripe.com/apikeys
2. En **"Standard keys"** verás:
   - **Publishable key** (pk_test_... o pk_live_...)
   - **Secret key** (sk_test_... o sk_live_...) - Click "Reveal test key"
3. **COPIA LA SECRET KEY** (sk_test_... para test mode)

### Paso 3: Configurar Variables de Entorno en Vercel

1. Ve a tu proyecto en Vercel: https://vercel.com/dashboard
2. Selecciona tu proyecto "HRKey-App"
3. Ve a **Settings** → **Environment Variables**
4. Agrega estas 2 variables:

```
STRIPE_SECRET_KEY
sk_test_YOUR_ACTUAL_SECRET_KEY_HERE

PRICE_ID_PRO
price_YOUR_ACTUAL_PRICE_ID_HERE
```

5. **Scope**: Selecciona Production, Preview, and Development
6. Click **"Save"**

### Paso 4: Redeploy

1. Ve a **Deployments**
2. Click en los **"..."** del deployment más reciente
3. Click **"Redeploy"**

O simplemente haz un nuevo commit y push:
```bash
git commit --allow-empty -m "Trigger redeploy for Stripe env vars"
git push
```

## ✅ Verificar que Funciona

1. Abre tu app en preview/producción
2. Login con cualquier método
3. Click en **"Upgrade to PRO"**
4. Deberías ver que:
   - Se abre una página segura de Stripe (checkout.stripe.com)
   - Puedes ingresar datos de tarjeta
   - No sale error "payment failed"

### Probar con Tarjeta de Test

En **Test Mode** (sk_test_...), usa:
- Número: `4242 4242 4242 4242`
- Fecha: Cualquier fecha futura (ej: 12/34)
- CVC: Cualquier 3 dígitos (ej: 123)
- ZIP: Cualquier código postal

## 🌐 Modo Test vs Producción

### Test Mode (Desarrollo)
- Secret key: `sk_test_...`
- Price ID: `price_...` (creado en Test mode)
- Tarjetas de prueba funcionan
- No se hacen cargos reales
- **Usa este modo mientras estés en preview**

### Live Mode (Producción)
- Secret key: `sk_live_...`
- Price ID: `price_...` (creado en Live mode)
- Solo tarjetas reales funcionan
- Se hacen cargos reales de $0.50
- Requiere que Stripe esté activado (verificación de cuenta)

## 🔐 Seguridad

✅ **Secret Key** (`sk_test_...`):
- NUNCA la expongas en el frontend
- Solo en variables de entorno de Vercel
- Es usada por tu API serverless `/api/checkout/session.js`

✅ **Publishable Key** (`pk_test_...`):
- Ya no la necesitas! Estamos usando API serverless
- El frontend solo llama a tu API

## 📋 Arquitectura

```
[Usuario] → Click "Upgrade PRO"
    ↓
[Frontend] → POST /api/checkout/session.js
             (envia: plan='pro', email)
    ↓
[Vercel API] → Llama a Stripe con STRIPE_SECRET_KEY
               Crea checkout session con PRICE_ID_PRO
    ↓
[Stripe API] → Responde con URL segura
    ↓
[Frontend] → Redirige a checkout.stripe.com
    ↓
[Usuario] → Ingresa tarjeta en página de Stripe
    ↓
[Stripe] → Procesa pago
    ↓
[Usuario] → Redirigido a /WebDapp/payment-success.html
    ↓
[Frontend] → Actualiza plan a PRO en localStorage
```

## ❓ Troubleshooting

### Error: "Missing STRIPE_SECRET_KEY"
**Solución**: Agrega `STRIPE_SECRET_KEY` en Vercel environment variables y redeploy.

### Error: "Invalid plan"
**Solución**: Agrega `PRICE_ID_PRO` en Vercel environment variables y redeploy.

### Error: "Forbidden" (403)
**Solución**: Tu dominio no está en ALLOWED_ORIGINS. Agrega tu dominio de preview en `/api/_lib/stripe.js`:
```javascript
export const ALLOWED_ORIGINS = new Set([
  "https://hrkey.xyz",
  "https://www.hrkey.xyz",
  "https://tu-proyecto-git-branch.vercel.app" // ← Agrega tu dominio
]);
```

### El botón no hace nada
**Solución**: Abre DevTools Console (F12) y mira el error. Probablemente falta configurar las env vars.

## 💰 Costos

- **Stripe**: Sin costo mensual
- **Tarifa por transacción**: 2.9% + $0.30 USD
- Para un pago de $0.50:
  - Stripe se queda: ~$0.31
  - Tú recibes: ~$0.19

💡 **Tip**: Para mejor margen, considera subir el precio a $1-2 USD.

## 📞 Soporte

- Documentación Stripe: https://stripe.com/docs/api
- Dashboard Stripe: https://dashboard.stripe.com
- Logs de Vercel: https://vercel.com/dashboard → Tu Proyecto → Logs

---

**¡Listo!** Una vez configurado, el botón "Upgrade to PRO" abrirá la página segura de Stripe automáticamente.
