# 🏗️ Arquitectura de HRKey App

## Tabla de Contenidos
1. [Visión General](#visión-general)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Arquitectura del Sistema](#arquitectura-del-sistema)
4. [Frontend (Next.js)](#frontend-nextjs)
5. [Backend (Express)](#backend-express)
6. [Base de Datos (Supabase)](#base-de-datos-supabase)
7. [Blockchain (Base Sepolia)](#blockchain-base-sepolia)
8. [Servicios Externos](#servicios-externos)
9. [Flujo de Datos](#flujo-de-datos)
10. [Variables de Entorno Explicadas](#variables-de-entorno-explicadas)

---

## Visión General

**HRKey** es una plataforma de referencias profesionales verificadas que combina:
- **Web2**: Autenticación, base de datos SQL, emails
- **Web3**: Blockchain para inmutabilidad, wallets custodiales

### ¿Qué hace HRKey?

1. **Usuarios** solicitan referencias profesionales
2. **Referentes** reciben emails con links únicos para completar referencias
3. **Referencias** se guardan en Supabase (web2) y opcionalmente en blockchain (web3)
4. **Plan PRO** permite features avanzadas via pago con Stripe

---

## Stack Tecnológico

### Frontend
- **Next.js 15.5.3** (React 19) - Framework principal
- **Turbopack** - Build system (más rápido que Webpack)
- **Tailwind CSS 4** - Estilos
- **OnchainKit** (Coinbase) - Componentes Web3
- **Wagmi + Viem** - Interacción con blockchain
- **ethers.js v6** - Librería Web3 alternativa

### Backend
- **Express** - API REST
- **Node.js** (ESM) - Runtime

### Base de Datos
- **Supabase** (PostgreSQL + Auth + Storage)

### Blockchain
- **Base Sepolia** (testnet) - Red L2 de Ethereum
- **Solidity** - Smart contracts
- **Hardhat** - Framework para desarrollo de contratos

### Servicios Externos
- **Resend** - Envío de emails transaccionales
- **Stripe** - Procesamiento de pagos
- **Coinbase CDP** - API para blockchain

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                        USUARIO FINAL                         │
│                    (Browser / Wallet)                        │
└────────────┬────────────────────────────┬───────────────────┘
             │                            │
             │ HTTPS                      │ Web3 (MetaMask)
             │                            │
┌────────────▼────────────┐   ┌──────────▼──────────┐
│   FRONTEND (Vercel)     │   │   BLOCKCHAIN        │
│   Next.js App           │   │   Base Sepolia      │
│                         │   │   Smart Contract    │
│  - Pages (SSR/SSG)      │   └─────────────────────┘
│  - API Routes           │
│  - Client Components    │
│                         │
│  Supabase Client ───────┼────┐
│  (Public Key)           │    │
└─────────────────────────┘    │
                               │
┌──────────────────────────────▼──────────────────────┐
│              SUPABASE (Backend as a Service)        │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │  PostgreSQL  │  │     Auth     │  │ Storage  │ │
│  │   Database   │  │  (JWT/OAuth) │  │  (Files) │ │
│  └──────────────┘  └──────────────┘  └──────────┘ │
│                                                      │
│  Tables:                                            │
│  - user_wallets      (wallets custodiales)         │
│  - user_plans        (free/pro)                    │
│  - references        (referencias completadas)     │
│  - reference_invites (invitaciones pendientes)     │
│  - kpi_suggestions   (KPIs sugeridos)              │
│  - people            (perfiles)                     │
└──────────────────────────────────────────────────────┘
             │
             │ Service Role Key (server-side)
             │
┌────────────▼────────────┐
│  BACKEND (Optional)     │
│  Express Server         │
│                         │
│  - Wallet Creation      │
│  - Reference Mgmt       │
│  - Stripe Integration   │
│  - Email (Resend)       │
└─────────────┬───────────┘
              │
              │ API calls
              │
┌─────────────▼───────────┐
│  SERVICIOS EXTERNOS     │
│                         │
│  ┌────────┐  ┌───────┐ │
│  │ Stripe │  │Resend │ │
│  │ Pagos  │  │Emails │ │
│  └────────┘  └───────┘ │
└─────────────────────────┘
```

---

## Frontend (Next.js)

### Estructura de Directorios

```
HRkey/
├── src/
│   ├── app/                    # App Router (Next.js 13+)
│   │   ├── page.tsx            # Homepage (/)
│   │   ├── layout.tsx          # Layout principal
│   │   ├── providers.tsx       # OnchainKit provider
│   │   ├── dashboard/          # Dashboard de usuario
│   │   │   └── page.tsx
│   │   ├── ref/verify/         # Página de verificación
│   │   │   └── page.tsx
│   │   ├── api/                # API Routes
│   │   │   └── invite/
│   │   │       └── route.ts    # POST /api/invite
│   │   └── ...
│   ├── components/             # Componentes React reutilizables
│   │   ├── Hero.tsx
│   │   ├── Navbar.tsx
│   │   └── ...
│   ├── lib/                    # Librerías y utilidades
│   │   ├── supabaseClient.js   # Cliente de Supabase
│   │   └── contract.js         # Interacción con smart contract
│   ├── utils/                  # Funciones auxiliares
│   │   └── appURL.ts           # Construcción de URLs
│   └── abi/                    # ABIs de smart contracts
│       └── HRKeyRegistry.json
├── api/                        # API Routes (Pages Router legacy)
│   ├── kpi-digest.ts           # Cron job para digest diario
│   ├── kpi-suggestions.ts      # POST KPIs
│   └── stripe/
│       └── webhook.js          # Webhook de Stripe
├── public/                     # Archivos estáticos
│   └── WebDapp/                # Dapp legacy
├── middleware.ts               # Middleware de Next.js
└── next.config.js              # Configuración de Next.js
```

### Páginas Principales

#### 1. Homepage (`/`)
- Landing page con Hero, Features, Testimonials
- Componentes: `Hero.tsx`, `Features.tsx`, `Testimonial.tsx`

#### 2. Dashboard (`/dashboard`)
**Propósito**: Panel de control del usuario

**Funcionalidades**:
- Ver mis referencias (lista completa)
- Crear nuevas referencias (borradores)
- Enviar invitaciones a referentes
- Editar referencias en borrador
- Ver links de invitación

**Flujo**:
```javascript
// 1. Usuario crea una referencia
createDraft() → supabase.insert('references')

// 2. Usuario envía invitación
sendInvite() → supabase.insert('reference_invites')
             → Genera link: /ref/verify?token=xxx
             → Puede enviar por email manualmente

// 3. Usuario puede re-enviar link
showInviteLink() → supabase.select('reference_invites')
                 → Muestra link para copiar
```

**Estados de Referencias**:
- `draft` - Borrador, no enviado
- `submitted` - Invitación enviada, pendiente
- `active` - Completada por el referente
- `verified` - Verificada en blockchain

#### 3. Verificación de Referencias (`/ref/verify`)
**Propósito**: Página donde el referente completa la referencia

**Flujo**:
```
1. Referente recibe email con link:
   https://tu-app.com/ref/verify?token=abc123

2. Página carga los datos de la invitación:
   - useSearchParams() obtiene el token
   - supabase.rpc('get_invite_by_token', { p_token: token })

3. Referente llena el formulario:
   - Resumen / Comentario
   - Calificación (1-5 estrellas)

4. Al enviar:
   - supabase.rpc('submit_reference_by_token', {...})
   - Actualiza reference_invites.status = 'completed'
   - Crea registro en 'references' tabla
```

**Validaciones**:
- Token válido
- No expirado (30 días)
- Estado = 'pending' (no completado anteriormente)

### API Routes

#### POST `/api/invite`
**Propósito**: Crear invitación de referencia

**Input**:
```json
{
  "userId": "uuid",
  "email": "referente@ejemplo.com",
  "name": "Juan Pérez",
  "applicantData": { ... }
}
```

**Output**:
```json
{
  "success": true,
  "inviteId": "uuid",
  "verifyUrl": "https://tu-app.com/ref/verify?token=xxx"
}
```

**Proceso**:
1. Genera token único (crypto.randomBytes)
2. Inserta en `reference_invites`
3. Construye URL de verificación
4. Retorna URL (opcionalmente envía email)

#### GET `/api/kpi-digest` (Cron)
**Propósito**: Enviar digest diario de KPIs sugeridos

**Funcionamiento**:
- Se ejecuta diariamente (configurable con Vercel Cron)
- Consulta KPIs creados hoy
- Genera HTML con tabla
- Envía email via Resend

---

## Backend (Express)

### ¿Por qué un backend separado?

**Opción 1: Solo API Routes de Next.js** (serverless)
- ✅ Más simple, todo en un deploy
- ❌ Límites de ejecución (10s en Vercel free)
- ❌ Cold starts

**Opción 2: Backend Express** (servidor persistente)
- ✅ Sin límites de tiempo
- ✅ WebSockets, procesos background
- ❌ Requiere deploy separado
- ❌ Más complejo

**Decisión**: Backend Express está incluido pero es **opcional**. Puedes usar solo API Routes de Next.js para empezar.

### Servicios del Backend

#### 1. WalletCreationService
**Propósito**: Crear wallets custodiales para usuarios

```javascript
// Usuario se registra
POST /api/wallet/create
{ userId, email }

// Backend crea wallet
1. ethers.Wallet.createRandom()
2. Encripta private key con AES-256-CBC
3. Guarda en user_wallets
4. Inicializa plan (free)

// Responde
{ address: "0x...", network: "base-mainnet" }
```

**¿Qué es custodial?**
- La app guarda las private keys (encriptadas)
- Usuario no necesita MetaMask
- Más fácil para onboarding
- **Trade-off**: Usuario no tiene control total

#### 2. ReferenceService
**Propósito**: Gestión completa de referencias

**Métodos**:
- `createReferenceRequest()` - Crear invitación
- `submitReference()` - Completar referencia
- `getReferenceByToken()` - Obtener invitación
- `sendRefereeInviteEmail()` - Enviar email
- `sendReferenceCompletedEmail()` - Notificar completado

**Email Templates**:
```html
<!-- Invitación al referente -->
<h2>You've been asked to provide a reference</h2>
<a href="{verificationUrl}">Complete Reference</a>

<!-- Notificación al solicitante -->
<h2>Your reference is ready!</h2>
<p>Overall Rating: {rating}/5 ⭐</p>
```

#### 3. Stripe Integration

**Flujo de Pago**:
```
1. Usuario quiere upgrade a PRO
   POST /create-payment-intent
   { amount: 999, email: "..." }

2. Backend crea Payment Intent
   stripe.paymentIntents.create({ amount: 999 })

3. Frontend muestra Stripe Checkout
   (usando Stripe.js)

4. Usuario completa pago

5. Stripe envía webhook
   POST /webhook
   event.type = 'payment_intent.succeeded'

6. Backend actualiza plan del usuario
   supabase.update('user_plans', { plan: 'pro' })
```

---

## Base de Datos (Supabase)

### Tablas Principales

#### `user_wallets`
```sql
- user_id (FK a auth.users)
- address (ethereum address)
- encrypted_private_key (AES-256 encrypted)
- network (base-mainnet / base-sepolia)
- wallet_type (custodial / external)
- is_active (boolean)
- created_at
```

**Uso**: Wallets custodiales generadas por el backend

#### `user_plans`
```sql
- user_id (FK)
- address (ethereum address)
- plan (free / pro)
- references_used (contador)
- references_limit (1 para free, ilimitado para pro)
- features (JSON)
  {
    canUseBlockchain: false,
    canAddPeerValidations: false,
    canShareReferences: true,
    ...
  }
- payment_tx_hash (stripe payment intent id)
- created_at
```

**Uso**: Control de planes y features por usuario

#### `references`
```sql
- id (uuid)
- owner_id (FK - quien solicitó)
- person_id (FK - perfil de la persona)
- referrer_name (nombre del referente)
- referrer_email
- relationship (colleague, manager, etc)
- summary (texto libre)
- overall_rating (1-5)
- kpi_ratings (JSON)
- detailed_feedback (JSON)
- status (draft, submitted, active, verified)
- blockchain_tx_hash (si se guardó onchain)
- invite_id (FK a reference_invites)
- created_at
```

**Uso**: Referencias completadas

#### `reference_invites`
```sql
- id (uuid)
- requester_id (FK - quien solicita)
- referee_email
- referee_name
- invite_token (hex string único)
- status (pending, completed, expired)
- expires_at (30 días)
- completed_at
- metadata (JSON - datos del aplicante)
- created_at
```

**Uso**: Invitaciones pendientes/completadas

#### `kpi_suggestions`
```sql
- id
- title (ej: "Comunicación efectiva")
- description
- position_hint (ej: "Software Engineer")
- company_hint
- user_email (quien lo sugirió)
- created_at
```

**Uso**: KPIs sugeridos por usuarios (feature comunitaria)

#### `people`
```sql
- id (uuid)
- user_id (FK)
- name
- email
- position
- company
- created_at
```

**Uso**: Perfiles de personas (para asociar múltiples referencias)

### Row Level Security (RLS)

Supabase usa PostgreSQL RLS para seguridad:

```sql
-- Ejemplo: Solo el owner puede ver sus referencias
CREATE POLICY "Users can view own references"
ON references FOR SELECT
USING (auth.uid() = owner_id);

-- Ejemplo: Solo service_role puede insertar en user_wallets
CREATE POLICY "Only service role can create wallets"
ON user_wallets FOR INSERT
TO service_role
WITH CHECK (true);
```

**Importante**:
- `anon` key - Acceso público (cliente)
- `service_role` key - Acceso completo (servidor)

---

## Blockchain (Base Sepolia)

### ¿Qué es Base?
- **Layer 2** de Ethereum (más barato y rápido)
- **Creado por Coinbase**
- **Compatible con Ethereum** (mismos contratos, mismas wallets)
- **Sepolia**: Red de prueba (testnet)

### Smart Contract: HRKeyRegistry

**Propósito**: Registrar referencias inmutables en blockchain

```solidity
// Simplified version
contract HRKeyRegistry {
  struct Reference {
    address owner;
    string refereeEmail; // hasheado
    uint8 rating;
    string ipfsHash; // metadata en IPFS
    uint256 timestamp;
    bool verified;
  }

  mapping(bytes32 => Reference) public references;

  function registerReference(
    string memory _refereeEmail,
    uint8 _rating,
    string memory _ipfsHash
  ) public {
    // Guarda referencia onchain
  }

  function verifyReference(bytes32 _refId) public {
    // Marca como verificada
  }
}
```

**¿Por qué blockchain?**
- ✅ Inmutable (no se puede alterar)
- ✅ Verificable públicamente
- ✅ Sin intermediarios
- ❌ Cuesta gas (aunque poco en Base)
- ❌ Público (hay que considerar privacidad)

### Interacción con el Contrato

**En el frontend** (`src/lib/contract.js`):

```javascript
import { getContract } from '@/lib/contract';

// Obtener instancia del contrato
const contract = await getContract(true); // true = con signer

// Leer (gratis)
const ref = await contract.getReference(refId);

// Escribir (cuesta gas)
const tx = await contract.registerReference(email, rating, ipfsHash);
await tx.wait(); // Esperar confirmación
```

**Flujo completo**:
```
1. Usuario completa referencia en Supabase
2. (Opcional) Usuario hace click "Guardar en Blockchain"
3. Frontend llama contract.registerReference()
4. MetaMask pide confirmación
5. Usuario paga gas (~$0.01)
6. Transacción se confirma
7. Se guarda tx_hash en Supabase
```

---

## Servicios Externos

### 1. Supabase
**Qué hace**: Backend as a Service

**Servicios usados**:
- **PostgreSQL**: Base de datos
- **Auth**: Autenticación (email/password, OAuth)
- **Storage**: Archivos (avatares, PDFs)
- **Realtime**: WebSockets (opcional)

**Keys**:
- `NEXT_PUBLIC_SUPABASE_URL`: URL pública del proyecto
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Key pública (segura para cliente)
- `SUPABASE_SERVICE_ROLE_KEY`: Key privada (NUNCA en frontend)

### 2. Resend
**Qué hace**: Envío de emails transaccionales

**Uso**:
```javascript
fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${RESEND_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    from: 'HRKey <noreply@hrkey.com>',
    to: 'usuario@ejemplo.com',
    subject: 'Reference Request',
    html: '<h1>...</h1>'
  })
});
```

**Ventajas** vs SendGrid/Mailgun:
- ✅ Más simple
- ✅ Mejor developer experience
- ✅ Gratis hasta 3,000 emails/mes

### 3. Stripe
**Qué hace**: Procesamiento de pagos

**Flujo**:
```
Frontend                Backend               Stripe
   |                       |                     |
   |-- Create Payment ---->|                     |
   |     Intent            |                     |
   |                       |-- Create Intent --->|
   |                       |<--- Client Secret --|
   |<--- Client Secret ----|                     |
   |                                             |
   |-- Confirm Payment ------------------------->|
   |     (Stripe.js)                             |
   |                                             |
   |<--- Success --------------------------------|
   |                                             |
   |                       |<--- Webhook --------|
   |                       |  (payment succeeded)|
   |                       |                     |
   |                       |-- Update DB         |
```

**Webhook Security**:
```javascript
// Vercel construye el event usando signature
const event = stripe.webhooks.constructEvent(
  req.body,
  sig,
  STRIPE_WEBHOOK_SECRET
);
// Solo eventos legítimos de Stripe pasan esta validación
```

### 4. Coinbase CDP (Developer Platform)
**Qué hace**: APIs para blockchain, wallets, datos

**Uso en HRKey**:
- OnchainKit components (conectar wallet)
- APIs de precios
- APIs de transacciones

**Setup**:
```jsx
import { OnchainKitProvider } from '@coinbase/onchainkit';

<OnchainKitProvider
  apiKey={process.env.NEXT_PUBLIC_CDP_API_KEY}
  chain={baseSepolia}
>
  {children}
</OnchainKitProvider>
```

### 5. Alchemy / Infura (RPC)
**Qué hace**: Nodos RPC para conectar con blockchain

**Alternativas**:
- Public RPC: `https://sepolia.base.org` (gratis, lento)
- Alchemy: `https://base-sepolia.g.alchemy.com/v2/YOUR_KEY` (rápido)

---

## Flujo de Datos

### Flujo 1: Solicitar Referencia

```
┌─────────┐
│ Usuario │
└────┬────┘
     │ 1. Entra a /dashboard
     ├──────────────────────────────────────┐
     │                                      │
     ▼                                      ▼
┌─────────────┐                    ┌──────────────┐
│  Dashboard  │                    │   Supabase   │
│   Page      │─ 2. Load refs ────>│  (select)    │
└─────┬───────┘                    └──────────────┘
      │
      │ 3. Click "Nueva Referencia"
      │
      ├─ Llena formulario:
      │  - Nombre del referente
      │  - Email del referente
      │  - Rating inicial
      │  - Resumen
      │
      │ 4. Click "Crear Borrador"
      │
      ▼
┌─────────────┐
│ createDraft │
│  function   │
└─────┬───────┘
      │
      │ 5. Insert en Supabase
      ▼
┌──────────────┐
│   Supabase   │
│   INSERT     │
│  references  │
│ status=draft │
└─────┬────────┘
      │
      │ 6. Success
      ▼
┌─────────────┐
│  Dashboard  │
│  (refresh)  │
│ Muestra nueva│
│   referencia │
└─────────────┘
```

### Flujo 2: Enviar Invitación

```
┌─────────┐
│ Usuario │
└────┬────┘
     │ 1. Click "Enviar a verificación"
     │    en referencia con status=draft
     ▼
┌──────────────┐
│ sendInvite() │
└──────┬───────┘
       │
       │ 2. Valida que referee_email existe
       │
       ▼
┌────────────────┐
│    Supabase    │
│     INSERT     │
│ reference_     │
│   invites      │
│ + token único  │
└────┬───────────┘
     │
     │ 3. Genera link:
     │    /ref/verify?token=abc123
     │
     ▼
┌────────────────┐
│    Supabase    │
│     UPDATE     │
│  references    │
│ status=        │
│  'submitted'   │
└────┬───────────┘
     │
     │ 4. Construye mailto: link
     │    o envía email (opcional)
     │
     ▼
┌────────────────┐
│   Dashboard    │
│  Muestra link  │
│  para copiar   │
└────────────────┘
```

### Flujo 3: Completar Referencia

```
┌───────────┐
│ Referente │
│  recibe   │
│   email   │
└─────┬─────┘
      │ 1. Click en link
      │    /ref/verify?token=abc123
      ▼
┌──────────────────┐
│  /ref/verify     │
│     Page         │
└────┬─────────────┘
     │
     │ 2. useSearchParams().get('token')
     │
     ▼
┌──────────────────┐
│    Supabase RPC  │
│ get_invite_by_   │
│     token        │
└────┬─────────────┘
     │
     │ 3. Retorna datos de invitación
     │
     ▼
┌──────────────────┐
│  Muestra Form    │
│  - Resumen       │
│  - Rating 1-5    │
└────┬─────────────┘
     │
     │ 4. Referente llena y envía
     │
     ▼
┌──────────────────┐
│   Supabase RPC   │
│  submit_         │
│  reference_by_   │
│     token        │
└────┬─────────────┘
     │
     │ 5. Dentro del RPC:
     │    a. Valida token
     │    b. Update invite (status=completed)
     │    c. Update reference (con datos)
     │    d. (Opcional) Envía email al solicitante
     │
     ▼
┌──────────────────┐
│  Página de       │
│   Gracias        │
│  "¡Referencia    │
│   enviada!"      │
└──────────────────┘
```

### Flujo 4: Pago Pro (Stripe)

```
┌─────────┐
│ Usuario │
└────┬────┘
     │ 1. Click "Upgrade to PRO"
     │
     ▼
┌──────────────────┐
│  Pricing Page    │
│  $9.99 lifetime  │
└────┬─────────────┘
     │
     │ 2. Click "Buy Now"
     │
     ▼
┌──────────────────┐
│  POST /create-   │
│  payment-intent  │
│  { amount: 999 } │
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│  Backend         │
│  Stripe API      │
│ .create({        │
│   amount: 999    │
│ })               │
└────┬─────────────┘
     │
     │ Retorna client_secret
     │
     ▼
┌──────────────────┐
│  Frontend        │
│  Stripe.js       │
│  Checkout Form   │
└────┬─────────────┘
     │
     │ Usuario ingresa tarjeta
     │
     ▼
┌──────────────────┐
│  Stripe          │
│  Procesa pago    │
└────┬─────────────┘
     │
     │ Success!
     │
     ├──────────────────┬─────────────────┐
     │                  │                 │
     ▼                  ▼                 ▼
┌─────────┐      ┌──────────┐    ┌──────────────┐
│Frontend │      │ Webhook  │    │   Supabase   │
│Success! │      │POST /    │    │    UPDATE    │
└─────────┘      │ webhook  │───>│  user_plans  │
                 │          │    │  plan='pro'  │
                 └──────────┘    └──────────────┘
```

---

## Variables de Entorno Explicadas

### Frontend (Next.js)

#### `NEXT_PUBLIC_SUPABASE_URL`
**Qué es**: URL de tu proyecto Supabase
**Ejemplo**: `https://abc123.supabase.co`
**Dónde obtener**: Supabase Dashboard → Settings → API → Project URL
**Por qué se necesita**: Para conectar el cliente de Supabase

#### `NEXT_PUBLIC_SUPABASE_ANON_KEY`
**Qué es**: Key pública de Supabase
**Ejemplo**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
**Dónde obtener**: Supabase Dashboard → Settings → API → anon public
**Por qué se necesita**: Autenticación inicial del cliente
**¿Es seguro exponerla?**: ✅ Sí, está diseñada para ser pública. La seguridad viene de RLS.

#### `SUPABASE_SERVICE_ROLE_KEY`
**Qué es**: Key privada con acceso completo
**Ejemplo**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (diferente)
**Dónde obtener**: Supabase Dashboard → Settings → API → service_role
**Por qué se necesita**: Para API Routes que necesitan bypass RLS
**¿Es seguro exponerla?**: ❌ NO. NUNCA en variables `NEXT_PUBLIC_`. Solo en API Routes.

#### `NEXT_PUBLIC_CDP_API_KEY`
**Qué es**: API Key de Coinbase Developer Platform
**Ejemplo**: `cdp_1234567890abcdef`
**Dónde obtener**: https://portal.cdp.coinbase.com/
**Por qué se necesita**: Para OnchainKit components y APIs blockchain

#### `NEXT_PUBLIC_CONTRACT_ADDRESS`
**Qué es**: Dirección del smart contract deployado
**Ejemplo**: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
**Dónde obtener**: Después de deployar con Hardhat (ver output)
**Por qué se necesita**: Para interactuar con el contrato desde el frontend

#### `NEXT_PUBLIC_APP_URL`
**Qué es**: URL pública de tu aplicación
**Ejemplo**: `https://hrkey.xyz` o `https://tu-app.vercel.app`
**Dónde configurar**: Manualmente, o Vercel lo detecta automáticamente
**Por qué se necesita**: Para construir links absolutos (emails, webhooks)

#### `RESEND_API_KEY`
**Qué es**: API Key de Resend para enviar emails
**Ejemplo**: `re_1234567890abcdef`
**Dónde obtener**: https://resend.com/api-keys
**Por qué se necesita**: Para enviar emails de invitación y notificaciones
**¿Es público?**: ❌ NO. Solo en API Routes o backend.

#### `STRIPE_SECRET_KEY`
**Qué es**: Secret Key de Stripe
**Ejemplo**: `sk_test_...` (test) o `sk_live_...` (producción)
**Dónde obtener**: https://dashboard.stripe.com/apikeys
**Por qué se necesita**: Para crear payment intents
**¿Es público?**: ❌ NO. Solo en API Routes o backend.

#### `STRIPE_WEBHOOK_SECRET`
**Qué es**: Secret para validar webhooks de Stripe
**Ejemplo**: `whsec_1234567890abcdef`
**Dónde obtener**: Stripe Dashboard → Developers → Webhooks → Signing secret
**Por qué se necesita**: Para verificar que los webhooks vienen realmente de Stripe

### Backend (Express)

Similar a frontend, pero todas son privadas:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (o `SUPABASE_SERVICE_KEY`)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `PORT` (ej: 3000)

### Hardhat (Contratos)

#### `BASE_SEPOLIA_RPC`
**Qué es**: URL del nodo RPC para Base Sepolia
**Ejemplo**: `https://sepolia.base.org` (público) o Alchemy
**Por qué se necesita**: Para deployar contratos

#### `PRIVATE_KEY`
**Qué es**: Private key de tu wallet para deployar
**Ejemplo**: `0x123abc...` (64 caracteres hex)
**⚠️ PELIGRO**: NUNCA comitear esto. Usa en `.env` local solamente.

#### `BASESCAN_API_KEY`
**Qué es**: API Key de BaseScan para verificar contratos
**Ejemplo**: `ABC123...`
**Dónde obtener**: https://basescan.org/myapikey
**Por qué se necesita**: Para hacer `verify` del contrato

---

## Resumen: ¿Qué se necesita mínimo para deployar?

### Para que funcione BÁSICO (sin pagos, sin blockchain):

```bash
# Frontend
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Ya con esto puedes:
- Ver la homepage
- Dashboard (si tienes Supabase configurado)
- Crear referencias
- Ver referencias

### Para COMPLETO:

```bash
# Frontend
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CDP_API_KEY=...
NEXT_PUBLIC_CONTRACT_ADDRESS=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

---

## Próximos Pasos

Ahora que entiendes la arquitectura:

1. **Lee** `DEPLOYMENT.md` para el paso a paso
2. **Configura** tus cuentas en los servicios
3. **Llena** los `.env.example` con tus keys reales
4. **Deploy** siguiendo la guía

¿Preguntas? Revisa las secciones relevantes o pregúntame directamente.
