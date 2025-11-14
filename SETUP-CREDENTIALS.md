# 🔐 Setup Final - Agregar Credenciales

## ✅ Ya Configurado

- [x] EmailJS (Emails)
- [x] Archivo `.env.local` creado

---

## 📝 Faltan estas credenciales

### 1. Supabase (Ya tienes cuenta)

Abre el archivo `HRkey/.env.local` y reemplaza estas líneas:

```bash
# Busca tu proyecto en: https://app.supabase.com/
# Settings → API

NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...tu-anon-key-aqui
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...tu-service-role-key-aqui
```

**Dónde encontrar:**
- URL: Dashboard → Settings → API → Project URL
- Anon Key: Dashboard → Settings → API → `anon` `public`
- Service Role: Dashboard → Settings → API → `service_role` (⚠️ secreto)

---

### 2. Stripe (Ya tienes cuenta)

```bash
# Dashboard: https://dashboard.stripe.com/test/apikeys

STRIPE_SECRET_KEY=sk_test_...tu-secret-key
STRIPE_WEBHOOK_SECRET=whsec_...webhook-secret
PRICE_ID_LIFETIME=price_...tu-price-id
```

**Dónde encontrar:**
- Secret Key: Developers → API Keys → Secret key
- Webhook Secret: Developers → Webhooks → (después de crear endpoint)
- Price ID: Products → Tu producto → Pricing → Copia el price ID

**Configurar Webhook Stripe:**
1. Webhooks → Add endpoint
2. URL: `https://tu-dominio.vercel.app/api/stripe/webhook`
3. Events: `checkout.session.completed`, `payment_intent.succeeded`
4. Copia el Signing secret

---

### 3. Blockchain (Opcional - solo si usas features blockchain)

```bash
NEXT_PUBLIC_CDP_API_KEY=tu-cdp-key
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...contract-address
```

**Dónde obtener:**
- CDP Key: https://portal.cdp.coinbase.com/
- Contract Address: Después de deployar tu contrato con Hardhat

**⚠️ Puedes saltarte esto por ahora** si no vas a usar blockchain inmediatamente.

---

## 🚀 Una vez agregadas las credenciales

### Probar localmente:

```bash
cd HRkey

# Verificar que .env.local existe y tiene las credenciales
cat .env.local

# Instalar dependencias (si no lo hiciste)
npm install

# Iniciar en desarrollo
npm run dev
```

Abre → http://localhost:3000

**Prueba:**
1. Ve a `/dashboard`
2. Crea una referencia
3. Envía invitación
4. Deberías recibir el email! 📧

---

### Deploy a Vercel:

```bash
# Opción 1: CLI
vercel --prod

# Durante el proceso, Vercel te preguntará si quieres
# agregar las variables de entorno desde .env.local
# Di que SÍ

# Opción 2: Dashboard
# 1. Conecta tu repo en vercel.com
# 2. Root Directory: HRkey
# 3. Settings → Environment Variables
# 4. Copia y pega cada variable de .env.local
```

---

## ✅ Checklist Final

Antes de deployar a producción:

- [ ] Credenciales de Supabase agregadas en `.env.local`
- [ ] Credenciales de Stripe agregadas en `.env.local`
- [ ] EmailJS funciona localmente (probado)
- [ ] `npm run dev` funciona sin errores
- [ ] Dashboard carga correctamente
- [ ] Puedes crear referencias
- [ ] Emails se envían correctamente
- [ ] Build compila: `npm run build`
- [ ] Variables agregadas en Vercel Dashboard
- [ ] Webhook de Stripe configurado

---

## 🆘 Si algo no funciona

### Error: "Supabase URL not defined"
→ Verifica que agregaste las credenciales en `.env.local`

### Error: "Cannot connect to Supabase"
→ Verifica que la URL y keys sean correctas (copia/pega directo del dashboard)

### Emails no se envían
→ Verifica en EmailJS Dashboard → Logs si hay errores

### Build falla
→ Corre `npm run build` y muéstrame el error

---

## 📞 Siguiente Paso

**Dime cuando hayas agregado las credenciales de Supabase y Stripe** y corremos `npm run dev` para probar todo junto! 🚀
