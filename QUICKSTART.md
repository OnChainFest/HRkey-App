# 🚀 Quick Start - Deployment

## Deploy en 5 minutos

### 1️⃣ Pre-requisitos

```bash
# Instalar Vercel CLI
npm install -g vercel

# Verificar instalación
vercel --version
```

### 2️⃣ Configurar Variables de Entorno

Crea un archivo `.env.local` en el directorio `HRkey/`:

```bash
cd HRkey
cp .env.example .env.local
# Edita .env.local con tus valores reales
```

**Valores mínimos requeridos:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_CDP_API_KEY`
- `NEXT_PUBLIC_CONTRACT_ADDRESS`

### 3️⃣ Probar localmente

```bash
# Desde HRkey/
npm install
npm run build
npm run dev

# Abre http://localhost:3000
```

### 4️⃣ Deploy a Vercel

**Opción A: Desde la terminal**
```bash
cd HRkey
vercel --prod
```

**Opción B: Desde GitHub**
1. Ve a https://vercel.com/new
2. Importa tu repo: `OnChainFest/HRkey-App`
3. Root Directory: `HRkey`
4. Agrega las variables de entorno
5. Deploy!

### 5️⃣ Verificar

Visita tu URL de Vercel y verifica:
- ✅ Homepage carga
- ✅ `/dashboard` funciona
- ✅ `/ping` devuelve "ok-app"

---

## 🔧 Troubleshooting Rápido

**Build falla en Vercel:**
```bash
# Verifica localmente primero
npm run build

# Si funciona local pero falla en Vercel, revisa:
# 1. Variables de entorno en Vercel Dashboard
# 2. Root Directory está configurado a "HRkey"
```

**Error de Supabase:**
```bash
# Verifica que las URLs sean correctas
# Formato: https://xxxxxxxxxxx.supabase.co
```

**Runtime errors:**
- Revisa los logs en Vercel Dashboard → Logs
- Verifica que TODAS las variables de entorno estén configuradas

---

## 📚 Más Info

Para deployment completo con backend, webhooks, etc., lee **[DEPLOYMENT.md](./DEPLOYMENT.md)**
