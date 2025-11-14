# 🎯 HRKey - Guía de Entendimiento Rápido

## ¿Qué es HRKey en 30 segundos?

**HRKey** es una plataforma de **referencias profesionales verificadas** que combina:
- 📧 Web tradicional (emails, base de datos)
- ⛓️ Blockchain (inmutabilidad, verificación)

**Propósito**: Que empresas/reclutadores puedan verificar referencias laborales de forma confiable.

---

## 🏗️ Componentes Principales

```
┌─────────────────────────────────────────────────────┐
│  1. FRONTEND (Next.js en Vercel)                    │
│     ↓                                               │
│     • Homepage con marketing                        │
│     • Dashboard para gestionar referencias          │
│     • Página de verificación para referentes        │
│     • Conecta con wallet (MetaMask)                 │
└──────────────────┬──────────────────────────────────┘
                   │
                   ├─────────────────┬─────────────────┐
                   │                 │                 │
         ┌─────────▼────────┐  ┌────▼─────┐   ┌──────▼───────┐
         │  2. SUPABASE     │  │3. BACKEND│   │4. BLOCKCHAIN │
         │  (PostgreSQL)    │  │ (Express)│   │ Base Sepolia │
         │                  │  │ opcional │   │              │
         │  • Users         │  └──────────┘   │ • Contrato   │
         │  • References    │                 │   HRKeyReg.  │
         │  • Invites       │                 └──────────────┘
         │  • Wallets       │
         │  • Plans         │
         └──────────────────┘
```

---

## 🔄 Flujo de Uso Típico

### Paso 1: Solicitar Referencia
```
Usuario → Dashboard → "Nueva referencia"
                   → Llena datos del referente
                   → Guarda en Supabase (status: draft)
```

### Paso 2: Enviar Invitación
```
Usuario → "Enviar a verificación"
       → Backend genera token único
       → Crea link: /ref/verify?token=abc123
       → (Opcional) Envía email automático
       → Status cambia a: submitted
```

### Paso 3: Referente Completa
```
Referente → Recibe email con link
         → Abre /ref/verify?token=abc123
         → Llena formulario (rating, comentarios)
         → Submit → Guarda en Supabase
         → Status cambia a: active
```

### Paso 4: (Opcional) Guardar en Blockchain
```
Usuario → "Guardar en blockchain"
       → MetaMask pide confirmación
       → Paga ~$0.01 de gas
       → Referencia queda inmutable onchain
       → Status cambia a: verified
```

---

## 📊 Modelo de Datos Simplificado

```
┌─────────────────┐
│     users       │ (Supabase Auth)
└────────┬────────┘
         │
         ├───────────┐
         │           │
         ▼           ▼
┌──────────────┐  ┌──────────────┐
│ user_plans   │  │ references   │
│              │  │              │
│ • plan       │  │ • owner_id   │──┐
│ • features   │  │ • referee    │  │
│ • limit      │  │ • rating     │  │
└──────────────┘  │ • status     │  │
                  │ • tx_hash    │  │
                  └──────┬───────┘  │
                         │          │
                         ▼          │
                  ┌──────────────┐  │
                  │reference_    │◄─┘
                  │invites       │
                  │              │
                  │ • token      │
                  │ • expires_at │
                  │ • status     │
                  └──────────────┘
```

**Estados de Referencia**:
- `draft` → En borrador
- `submitted` → Invitación enviada
- `active` → Completada por referente
- `verified` → Guardada en blockchain

---

## 💰 Modelo de Negocio

### Plan FREE
- ✅ 1 referencia
- ✅ Ver referencias
- ❌ No blockchain
- ❌ No peer validations

### Plan PRO ($9.99 lifetime)
- ✅ Referencias ilimitadas
- ✅ Guardar en blockchain
- ✅ Peer validations
- ✅ Compartir referencias
- ✅ Datos verificables

**Pago**: Stripe (tarjeta de crédito)

---

## 🔐 Seguridad y Privacidad

### Autenticación
- **Supabase Auth**: Email/password, OAuth (Google, etc)
- **JWT tokens**: Sesiones seguras
- **RLS**: Row Level Security en PostgreSQL

### Wallets
- **Custodial**: App guarda las keys (encriptadas con AES-256)
- **External**: Usuario conecta su MetaMask
- **Ventaja custodial**: Onboarding más fácil
- **Ventaja external**: Usuario controla 100%

### Privacidad en Blockchain
- ❌ **NO** se guarda información personal onchain
- ✅ Solo hash del email + rating + IPFS hash
- ✅ Metadata completa en Supabase (privado)

---

## 🌐 Servicios Externos

| Servicio | Propósito | Costo |
|----------|-----------|-------|
| **Vercel** | Hosting frontend | Gratis hasta 100GB bandwidth |
| **Supabase** | Database + Auth | Gratis hasta 500MB DB |
| **Resend** | Emails | Gratis hasta 3,000/mes |
| **Stripe** | Pagos | 2.9% + $0.30 por transacción |
| **Coinbase CDP** | Blockchain APIs | Gratis con límites |
| **Base Sepolia** | Testnet | Gratis (ETH falso) |

**Total para empezar**: $0 (todo en free tiers)

---

## 🚀 Deployment: 3 Opciones

### Opción 1: Solo Frontend (Mínimo Viable)
```bash
cd HRkey
vercel --prod
```
**Qué funciona**:
- ✅ Homepage
- ✅ Dashboard
- ✅ Referencias (si configuras Supabase)
- ❌ Emails automáticos
- ❌ Blockchain

**Variables necesarias**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Opción 2: Frontend + Emails
**Variables adicionales**:
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

**Qué funciona**:
- ✅ Todo lo anterior
- ✅ Emails automáticos

### Opción 3: Full Stack (Todo)
**Variables adicionales**:
- `NEXT_PUBLIC_CDP_API_KEY`
- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

**Qué funciona**:
- ✅ Todo
- ✅ Blockchain
- ✅ Pagos
- ✅ Features completas

---

## 📖 Documentación Disponible

1. **`ARCHITECTURE.md`** (este archivo)
   - Arquitectura completa
   - Diagramas
   - Explicación técnica profunda

2. **`DEPLOYMENT.md`**
   - Guía paso a paso para deployar
   - Configuración de servicios
   - Troubleshooting

3. **`QUICKSTART.md`**
   - Deploy en 5 minutos
   - Mínimo necesario

4. **`README.md`** (del proyecto)
   - Descripción del producto
   - Features
   - Screenshots

---

## ❓ Preguntas Frecuentes

### ¿Necesito saber blockchain para usar esto?
**No**. Como usuario final, es transparente. Como developer, las librerías (ethers.js, wagmi) abstraen la complejidad.

### ¿Es caro guardar en blockchain?
**No**. Base es un L2, transacciones cuestan ~$0.001 - $0.01. Mucho más barato que Ethereum mainnet.

### ¿Qué pasa si un usuario no paga?
Queda en plan FREE, con límite de 1 referencia. Las referencias existentes siguen disponibles.

### ¿Los emails se envían automáticamente?
Solo si configuras `RESEND_API_KEY`. De lo contrario, la app genera el link y el usuario lo copia manualmente.

### ¿Necesito el backend Express o solo Next.js?
**Solo Next.js es suficiente** para la mayoría de casos. El backend Express es para:
- Procesos largos (>10s)
- WebSockets
- Lógica muy compleja

Next.js API Routes cubre el 95% de los casos.

### ¿Dónde está el smart contract?
En `contracts/PeerProofRegistry.sol` (o similar). Ya está deployado en Base Sepolia. Puedes ver la address en `artifacts/`.

### ¿Cómo actualizo el contrato?
```bash
# 1. Edita el contrato
vim contracts/HRKeyRegistry.sol

# 2. Compila
npm run compile

# 3. Deploy
npm run deploy:base-sepolia

# 4. Actualiza la address en .env
NEXT_PUBLIC_CONTRACT_ADDRESS=0xNuevaAddress
```

---

## 🎓 Para Aprender Más

### Tecnologías Clave
- **Next.js**: https://nextjs.org/docs
- **Supabase**: https://supabase.com/docs
- **ethers.js**: https://docs.ethers.org
- **Wagmi**: https://wagmi.sh/
- **Base**: https://docs.base.org/

### Tutoriales Recomendados
1. Next.js App Router (oficial)
2. Supabase + Next.js (oficial)
3. Building on Base (Coinbase)

---

## 🛠️ Debugging Común

### Error: "Supabase URL not defined"
**Causa**: Falta variable de entorno
**Fix**: Verifica que `NEXT_PUBLIC_SUPABASE_URL` esté en Vercel

### Error: "Cannot find module '@/utils/appURL'"
**Causa**: Archivo faltante
**Fix**: Ya lo creamos en `/home/user/HRkey-App/HRkey/src/utils/appURL.ts`

### Error: "Build failed" en Vercel
**Causa**: Probablemente TypeScript errors
**Fix**: Corre `npm run build` localmente primero y corrige errores

### Emails no se envían
**Causa**: Falta `RESEND_API_KEY` o está mal configurada
**Fix**:
1. Verifica key en Resend dashboard
2. Asegúrate que esté en variables de Vercel
3. Redeploy

### Transacción blockchain falla
**Causas comunes**:
1. No tienes ETH en tu wallet (Sepolia)
2. Red incorrecta (debe ser Base Sepolia)
3. Contrato no deployado

**Fixes**:
1. Consigue ETH Sepolia gratis: https://sepoliafaucet.com
2. En MetaMask, agrega Base Sepolia manualmente
3. Verifica que `NEXT_PUBLIC_CONTRACT_ADDRESS` sea correcta

---

## 📞 Soporte

Si algo no funciona:

1. **Revisa logs** en Vercel Dashboard
2. **Lee** `DEPLOYMENT.md` sección Troubleshooting
3. **Verifica** todas las variables de entorno
4. **Prueba** localmente primero: `npm run dev`

---

## ✅ Checklist: "¿Entiendo el proyecto?"

- [ ] Sé qué hace HRKey (referencias profesionales)
- [ ] Entiendo los 4 componentes (Frontend, Supabase, Backend, Blockchain)
- [ ] Sé el flujo: solicitar → enviar → completar → (blockchain)
- [ ] Entiendo los estados de referencia (draft, submitted, active, verified)
- [ ] Sé qué servicios externos se usan y para qué
- [ ] Entiendo la diferencia entre plan FREE y PRO
- [ ] Sé qué variables de entorno son necesarias mínimo
- [ ] Puedo explicar por qué se usa blockchain (opcional)
- [ ] Sé dónde está cada cosa en el código

Si marcaste todos ✅, estás listo para deployar! 🚀

---

**Próximo paso**: Lee `DEPLOYMENT.md` para deployar paso a paso.
