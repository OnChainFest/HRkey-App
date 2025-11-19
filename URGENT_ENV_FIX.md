# 🚨 ACCIÓN URGENTE REQUERIDA: Configurar SUPABASE_SERVICE_ROLE

## Problema Actual

El código está fallando porque **falta una variable de entorno crítica en Vercel**:

### ❌ Variable INCORRECTA (actualmente configurada):
```
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
Esta es la clave **pública** que se usa en el frontend. **NO tiene permisos de administrador**.

### ✅ Variable REQUERIDA (falta agregar):
```
SUPABASE_SERVICE_ROLE = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...(diferente key)
```
Esta es la clave **privada** de administrador que necesitan los endpoints de API para:
- Leer/escribir en la tabla `users`
- Actualizar información de suscripciones de Stripe
- Crear y gestionar customer IDs

---

## Cómo Obtener SUPABASE_SERVICE_ROLE

1. **Ve a tu Dashboard de Supabase:**
   - https://app.supabase.com

2. **Selecciona tu proyecto** (wrervcydgdrlcndtjboy.supabase.co)

3. **Ve a Settings → API**

4. **Copia la clave llamada "service_role key"**
   - ⚠️ **NO copies la "anon key"** (esa ya la tienes)
   - ⚠️ **La service_role key es diferente y más larga**
   - ⚠️ **Nunca expongas esta clave en el frontend**

5. **Se ve algo así:**
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXJ2Y3lkZ2RybGNuZHRqYm95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Nzk3NjE1NiwiZXhwIjoyMDczNTUyMTU2fQ.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```
   - Nota el `"role":"service_role"` en el token (vs `"role":"anon"` en la anon key)

---

## Cómo Agregar la Variable en Vercel

1. **Ve a tu proyecto en Vercel Dashboard**

2. **Settings → Environment Variables**

3. **Agrega esta nueva variable:**
   - **Key**: `SUPABASE_SERVICE_ROLE`
   - **Value**: (pega la service_role key que copiaste de Supabase)
   - **Environments**: Marca **Production**, **Preview**, y **Development**

4. **Click "Save"**

5. **IMPORTANTE: Redeploy tu proyecto**
   - Ve a la pestaña **Deployments**
   - Click en el **...** del último deployment
   - Click **Redeploy**

---

## Variables de Entorno - Estado Actual vs Requerido

### ✅ Ya Configuradas Correctamente:
```bash
STRIPE_SECRET_KEY = sk_... ✓
SUPABASE_URL = https://wrervcydgdrlcndtjboy.supabase.co ✓
SUPABASE_ANON_KEY = eyJ... (para frontend) ✓
```

### ✅ Actualizaciones Realizadas en el Código:
```bash
# El código ahora acepta PRICE_ID_LIFETIME en lugar de PRICE_ID_ANNUAL
PRICE_ID_LIFETIME = price_... ✓
```

### ❌ FALTA AGREGAR (Causa del Error):
```bash
SUPABASE_SERVICE_ROLE = (falta - necesitas agregarlo)
```

---

## Verificación

Después de agregar `SUPABASE_SERVICE_ROLE` y redesplegar:

1. **Prueba el botón "Upgrade Pro"** en el dashboard
2. **Debería redirigir a Stripe checkout** sin errores
3. **Si aún falla**, revisa los logs de Vercel:
   - Deployments → Functions → `/api/checkout`
   - Busca mensajes de error en rojo

---

## ⚠️ Seguridad Importante

**NUNCA** uses `SUPABASE_SERVICE_ROLE` en código del frontend (archivos en `public/` o componentes de React).

La SERVICE_ROLE key solo debe usarse en:
- ✅ API Routes (`pages/api/*.ts`)
- ✅ Server-side code
- ❌ Nunca en archivos HTML
- ❌ Nunca en JavaScript del cliente

---

## Resumen de Acción Requerida

1. ✅ Ir a Supabase Dashboard
2. ✅ Copiar la "service_role key" (Settings → API)
3. ✅ Agregar `SUPABASE_SERVICE_ROLE` en Vercel
4. ✅ Redesplegar el proyecto
5. ✅ Probar el botón "Upgrade Pro"

Una vez hecho esto, el error "Unexpected end of JSON input" desaparecerá y el checkout funcionará correctamente.
