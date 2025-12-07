# 🚨 GUÍA DE REMEDIACIÓN DE SEGURIDAD - FASE 0

**Fecha:** 7 de diciembre de 2025
**Criticidad:** 🔴 MÁXIMA
**Estado:** ✅ Paso 1 completado - Credenciales removidas de git

---

## ✅ PASO 1: COMPLETADO

El archivo `backend/.env` ha sido removido del tracking de git:

```bash
✅ git rm --cached backend/.env
✅ git commit -m "security: remove exposed credentials"
✅ git push origin claude/production-readiness-analysis-011djZiL2uJjqsDthZBeRPxf
```

**Importante:** El archivo `.env` todavía existe localmente en tu máquina (no ha sido eliminado), solo fue removido del repositorio git. Esto es intencional para que no pierdas tu configuración local.

---

## 🔴 PASO 2: REVOCAR CREDENCIALES (REQUIERE ACCIÓN MANUAL)

### ⚠️ CREDENCIALES EXPUESTAS IDENTIFICADAS:

Las siguientes credenciales estaban en el repositorio git y **deben ser revocadas inmediatamente**:

```env
SUPABASE_URL=https://wrervcydgdrlcndtjboy.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXJ2Y3lkZ2RybGNuZHRqYm95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NzYxNTYsImV4cCI6MjA3MzU1MjE1Nn0.63M53sZW4LEYMOaxScvtLhQr_6VUj7rOaaGtlR745IM
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXJ2Y3lkZ2RybGNuZHRqYm95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Nzk3NjE1NiwiZXhwIjoyMDczNTUyMTU2fQ.ZmWmtPEL8fZnEpkC33vd9_DLTpZghBsuwVjOh3BnldM
```

---

## 📋 INSTRUCCIONES PASO A PASO

### A. REVOCAR Y REGENERAR CREDENCIALES DE SUPABASE

#### 1. Acceder al Dashboard de Supabase

```bash
URL: https://supabase.com/dashboard/project/wrervcydgdrlcndtjboy
```

#### 2. Regenerar ANON KEY

**Pasos:**
1. Ve a **Settings** → **API**
2. Localiza **Project API keys**
3. Encuentra `anon` / `public`
4. Haz clic en **"Regenerate"** o **"Rotate"**
5. **COPIA LA NUEVA KEY** (se mostrará solo una vez)
6. Guárdala temporalmente en un lugar seguro

#### 3. Regenerar SERVICE_ROLE KEY

**Pasos:**
1. En la misma página (**Settings** → **API**)
2. Localiza `service_role` key
3. Haz clic en **"Regenerate"** o **"Rotate"**
4. **COPIA LA NUEVA KEY** (se mostrará solo una vez)
5. Guárdala temporalmente

⚠️ **ADVERTENCIA:** La `SERVICE_ROLE_KEY` tiene privilegios de administrador y bypasea Row Level Security. Mantenla segura.

#### 4. Actualizar .env local

Edita `backend/.env` con las nuevas claves:

```bash
# Actualizar estas líneas:
SUPABASE_ANON_KEY=<NUEVA_ANON_KEY_AQUI>
SUPABASE_SERVICE_ROLE_KEY=<NUEVA_SERVICE_ROLE_KEY_AQUI>
```

---

### B. ROTAR CREDENCIALES DE STRIPE

#### 1. Acceder al Dashboard de Stripe

```bash
URL: https://dashboard.stripe.com/apikeys
```

#### 2. Verificar claves actuales

**Verifica si las siguientes claves están activas:**
- Secret Key (sk_live_...)
- Webhook Secret (whsec_...)

#### 3. Rotar Secret Key

**Pasos:**
1. Ve a **Developers** → **API keys**
2. En la sección **Standard keys**
3. Haz clic en **"Create secret key"**
4. Dale un nombre descriptivo: "HRKey Backend - Dec 2025"
5. **COPIA LA NUEVA SECRET KEY**
6. Una vez que hayas actualizado todos los servicios, **ELIMINA la clave antigua**

#### 4. Rotar Webhook Secret

**Pasos:**
1. Ve a **Developers** → **Webhooks**
2. Encuentra tu webhook endpoint (probablemente `https://hrkey-backend.onrender.com/webhooks/stripe`)
3. Haz clic en el webhook
4. Haz clic en **"Roll secret"** o crea un nuevo webhook
5. **COPIA EL NUEVO WEBHOOK SECRET** (empieza con `whsec_`)

#### 5. Actualizar .env local

```bash
# Actualizar estas líneas:
STRIPE_SECRET_KEY=<NUEVA_SECRET_KEY_AQUI>
STRIPE_WEBHOOK_SECRET=<NUEVO_WEBHOOK_SECRET_AQUI>
```

---

### C. REGENERAR API KEY DE RESEND

#### 1. Acceder al Dashboard de Resend

```bash
URL: https://resend.com/api-keys
```

#### 2. Crear nueva API Key

**Pasos:**
1. Ve a **API Keys**
2. Haz clic en **"Create API Key"**
3. Dale un nombre: "HRKey Backend - Production"
4. Selecciona permisos: **Full Access** (o solo **Sending Access** si prefieres)
5. **COPIA LA NUEVA API KEY**
6. Una vez actualizado todo, **ELIMINA la clave antigua**

#### 3. Actualizar .env local

```bash
# Actualizar esta línea:
RESEND_API_KEY=<NUEVA_API_KEY_AQUI>
```

---

### D. ACTUALIZAR VARIABLES EN RENDER

#### 1. Acceder al Dashboard de Render

```bash
URL: https://dashboard.render.com/
```

#### 2. Seleccionar el servicio backend

**Pasos:**
1. Encuentra tu servicio: **hrkey-backend** (o el nombre que hayas usado)
2. Haz clic en él

#### 3. Actualizar Environment Variables

**Pasos:**
1. Ve a **Environment** (en el menú lateral)
2. Actualiza las siguientes variables con los **NUEVOS VALORES**:

```bash
SUPABASE_ANON_KEY=<NUEVA_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<NUEVA_SERVICE_ROLE_KEY>
STRIPE_SECRET_KEY=<NUEVA_SECRET_KEY>
STRIPE_WEBHOOK_SECRET=<NUEVO_WEBHOOK_SECRET>
RESEND_API_KEY=<NUEVA_API_KEY>
```

#### 4. Guardar y redeploy

**Pasos:**
1. Haz clic en **"Save Changes"**
2. Render automáticamente hará **redeploy** del servicio
3. Espera a que el deploy complete (~2-3 minutos)
4. Verifica que el servicio esté **"Live"** (verde)

---

### E. ACTUALIZAR VARIABLES EN VERCEL (Frontend)

#### 1. Acceder al Dashboard de Vercel

```bash
URL: https://vercel.com/dashboard
```

#### 2. Seleccionar el proyecto

**Pasos:**
1. Encuentra tu proyecto: **hrkey** o **hrkey-app**
2. Haz clic en él

#### 3. Actualizar Environment Variables

**Pasos:**
1. Ve a **Settings** → **Environment Variables**
2. Actualiza (si están presentes):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://wrervcydgdrlcndtjboy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<NUEVA_ANON_KEY>
```

⚠️ **Nota:** La `ANON_KEY` es segura de exponer en el frontend (es pública), pero aún así es buena práctica rotarla.

#### 4. Redeploy

**Pasos:**
1. Ve a **Deployments**
2. Haz clic en los **"..."** del último deployment
3. Selecciona **"Redeploy"**
4. Espera a que complete (~1-2 minutos)

---

## ✅ VERIFICACIÓN

### Checklist de Verificación Post-Rotación

Una vez completados todos los pasos, verifica:

#### Backend (Render)
```bash
# 1. Verifica que el servicio está live
curl https://hrkey-backend.onrender.com/health

# Debería responder con algo como:
# {"status":"healthy","timestamp":"...","services":{...}}
```

⚠️ **Nota:** El endpoint `/health` aún no está implementado, así que esto puede fallar. Verifica en el dashboard de Render que el servicio está "Live" (verde).

#### Frontend (Vercel)
```bash
# Visita tu frontend
open https://www.hrkey.xyz  # o tu URL de Vercel

# Verifica que:
- [ ] La página carga correctamente
- [ ] Puedes hacer login con Supabase
- [ ] No hay errores en la consola del navegador
```

#### Supabase Connection
```bash
# En tu máquina local, prueba el backend:
cd backend/
node -e "
  import { createClient } from '@supabase/supabase-js';
  import dotenv from 'dotenv';
  dotenv.config();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase.from('users').select('count');
  console.log('✅ Supabase connection:', data ? 'SUCCESS' : 'FAILED');
  if (error) console.error('❌', error);
"
```

#### Stripe Webhooks
```bash
# Testea el webhook con Stripe CLI (opcional)
stripe listen --forward-to localhost:3001/webhooks/stripe

# O verifica en Stripe Dashboard → Developers → Webhooks
# que los eventos están llegando correctamente
```

---

## 📊 ESTADO DE COMPLETITUD

```
┌───────────────────────────────────────────────┬──────────┐
│ Tarea                                         │ Estado   │
├───────────────────────────────────────────────┼──────────┤
│ ✅ Remover .env del git tracking             │ COMPLETO │
│ ⏳ Revocar Supabase ANON_KEY                 │ PENDIENTE│
│ ⏳ Revocar Supabase SERVICE_ROLE_KEY         │ PENDIENTE│
│ ⏳ Rotar Stripe Secret Key                   │ PENDIENTE│
│ ⏳ Rotar Stripe Webhook Secret               │ PENDIENTE│
│ ⏳ Regenerar Resend API Key                  │ PENDIENTE│
│ ⏳ Actualizar variables en Render            │ PENDIENTE│
│ ⏳ Actualizar variables en Vercel            │ PENDIENTE│
│ ⏳ Verificar servicios funcionando           │ PENDIENTE│
└───────────────────────────────────────────────┴──────────┘
```

---

## 🛡️ PASO 3 (OPCIONAL): LIMPIAR HISTORIAL DE GIT

**Advertencia:** Este paso es **OPCIONAL** pero **RECOMENDADO** para seguridad máxima.

El problema es que aunque removimos `backend/.env` del tracking, **todavía existe en el historial de git**. Cualquiera con acceso al repositorio puede hacer `git log` y recuperar las credenciales antiguas.

### Opción A: git-filter-repo (Recomendado)

```bash
# 1. Instalar git-filter-repo
pip install git-filter-repo

# 2. Hacer backup del repo
cd /home/user/HRkey-App
cp -r .git .git.backup

# 3. Remover backend/.env de TODO el historial
git filter-repo --path backend/.env --invert-paths

# 4. Force push (coordinar con el equipo)
git push origin --force --all
git push origin --force --tags
```

### Opción B: BFG Repo-Cleaner

```bash
# 1. Descargar BFG
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# 2. Ejecutar limpieza
java -jar bfg-1.14.0.jar --delete-files backend/.env

# 3. Limpiar referencias
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 4. Force push
git push origin --force --all
```

⚠️ **ADVERTENCIA IMPORTANTE:**
- El force push **REESCRIBE EL HISTORIAL DE GIT**
- Todos los colaboradores necesitarán hacer `git clone` del repo nuevamente
- Cualquier PR abierto necesitará ser recreado
- Coordina con tu equipo antes de ejecutar esto

---

## 📝 NOTAS IMPORTANTES

### 1. ¿Por qué las credenciales antiguas siguen siendo peligrosas?

Aunque las hayas revocado, si alguien hizo un `git clone` o `git pull` antes de que las revocaras, tiene una copia de las credenciales en su máquina. Por eso es crítico:
- ✅ Revocarlas INMEDIATAMENTE
- ✅ Monitorear logs de acceso en Supabase/Stripe
- ✅ Revisar actividad sospechosa

### 2. ¿El archivo .env local fue eliminado?

**NO.** El archivo `backend/.env` todavía existe en tu máquina local. Solo fue removido del repositorio git. Esto es intencional para que no pierdas tu configuración.

### 3. ¿Necesito actualizar otros archivos?

No. El único archivo que contenía credenciales era `backend/.env`. Otros archivos como `.env.example` son solo plantillas sin valores reales.

### 4. ¿Qué pasa si ya hay otros clones del repositorio?

Cualquier persona que haya clonado el repo antes de este fix tiene acceso a las credenciales antiguas en su historial local. Por eso:
1. ✅ Revocar las credenciales es CRÍTICO
2. ⚠️ Considerar limpiar el historial de git (Paso 3 opcional)
3. ⚠️ Notificar al equipo para que borren sus clones locales y hagan clone nuevamente

---

## 🆘 SOPORTE

### Si encuentras problemas:

#### Supabase no conecta después de rotar keys:
```bash
# Verifica las variables en Render
# Asegúrate de haber guardado y redeployado

# Verifica localmente
echo $SUPABASE_ANON_KEY
# Debe mostrar la NUEVA key
```

#### Stripe webhooks fallan:
```bash
# Verifica en Stripe Dashboard → Developers → Webhooks
# Asegúrate de que el endpoint URL es correcto
# Verifica que el webhook secret fue actualizado en Render
```

#### Backend no inicia en Render:
```bash
# Ve a Render Dashboard → tu servicio → Logs
# Busca errores relacionados con environment variables
# Verifica que TODAS las variables necesarias están configuradas
```

---

## ⏱️ TIEMPO ESTIMADO

| Tarea | Tiempo |
|-------|--------|
| Revocar Supabase keys | 5-10 min |
| Rotar Stripe keys | 5-10 min |
| Regenerar Resend key | 2-5 min |
| Actualizar Render | 5 min |
| Actualizar Vercel | 5 min |
| Verificación | 10 min |
| **TOTAL** | **30-45 min** |

---

## ✅ CHECKLIST FINAL

Marca cada item cuando lo completes:

```bash
Revocación de Credenciales:
- [ ] Regenerada SUPABASE_ANON_KEY
- [ ] Regenerada SUPABASE_SERVICE_ROLE_KEY
- [ ] Rotada STRIPE_SECRET_KEY
- [ ] Rotado STRIPE_WEBHOOK_SECRET
- [ ] Regenerada RESEND_API_KEY

Actualización de Servicios:
- [ ] Variables actualizadas en Render
- [ ] Render redeployado exitosamente
- [ ] Variables actualizadas en Vercel
- [ ] Vercel redeployado exitosamente

Actualización Local:
- [ ] backend/.env actualizado con nuevas keys
- [ ] Verificado que backend/.env NO está en git
- [ ] Testeado conexión local a Supabase

Verificación:
- [ ] Backend en Render está "Live" (verde)
- [ ] Frontend en Vercel carga correctamente
- [ ] Login con Supabase funciona
- [ ] No hay errores en logs

Opcional (Seguridad Máxima):
- [ ] Historial de git limpiado con git-filter-repo
- [ ] Force push completado
- [ ] Equipo notificado para re-clone
```

---

## 📞 SIGUIENTE PASO

Una vez completada la **Fase 0**, el siguiente paso es:

**Fase 1 - Critical Path:** Implementar tests y seguridad básica
- Tests críticos (40% coverage)
- Helmet.js (security headers)
- Rate limiting
- Input validation (Zod)
- Smart contract audit

Ver **PRODUCTION_READINESS_ANALYSIS.md** para el plan completo.

---

**Fecha de este documento:** 7 de diciembre de 2025
**Autor:** Claude Code
**Relacionado con:** PRODUCTION_READINESS_ANALYSIS.md - Fase 0 (EMERGENCIA)
