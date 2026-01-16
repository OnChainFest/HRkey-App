# HRKey Data Access & Revenue Sharing System

## 📋 Índice

1. [Resumen General](#resumen-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Base de Datos](#base-de-datos)
4. [API Endpoints](#api-endpoints)
5. [Flujo de Negocio](#flujo-de-negocio)
6. [Smart Contract (Web3)](#smart-contract-web3)
7. [Configuración](#configuración)
8. [Guía de Implementación](#guía-de-implementación)
9. [Testing](#testing)
10. [Próximos Pasos (Phase 2)](#próximos-pasos-phase-2)

---

## 🎯 Resumen General

HRKey ahora implementa un **sistema de "pago por consulta de datos con reparto de ingresos"** ligado a la wallet del usuario.

### Funcionalidad Principal

Cuando una **empresa** (company) quiere acceder a datos sensibles de un **candidato** (usuario):

1. **Solicitud de Acceso**: La empresa crea una solicitud indicando qué datos quiere consultar.
2. **Consentimiento del Usuario**: El usuario recibe una notificación y debe **aprobar** la solicitud firmando con su wallet.
3. **Cobro y Reparto**: Al aprobar, se cobra una tarifa que se reparte automáticamente:
   - **40%** para el usuario dueño del perfil
   - **40%** para HRKey (plataforma)
   - **20%** para el creador de la referencia
4. **Entrega de Datos**: La empresa puede consultar los datos autorizados.

### Opciones de Pago

- **Web2 (Implementado)**: Ledger interno que registra transacciones y balances.
- **Web3 (Preparado)**: Smart contract en Base blockchain para distribución automática on-chain.

---

## 🏗️ Arquitectura del Sistema

### Componentes Principales

```
┌──────────────────────────────────────────────────────────────┐
│                     HRKEY ECOSYSTEM                           │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────┐    solicita      ┌─────────────┐           │
│  │  EMPRESA   │ ────────────────> │   USUARIO   │           │
│  │ (Company)  │    datos          │ (Candidate) │           │
│  └────────────┘                    └─────────────┘           │
│        │                                  │                   │
│        │                                  │                   │
│        ▼                                  ▼                   │
│  ┌─────────────────────────────────────────────────┐        │
│  │        DATA ACCESS REQUEST API                  │        │
│  │   (backend/controllers/dataAccessController)    │        │
│  └─────────────────────────────────────────────────┘        │
│        │                                  │                   │
│        │                                  │                   │
│        ▼                                  ▼                   │
│  ┌──────────────────┐            ┌───────────────────┐      │
│  │  SUPABASE DB     │            │  WALLET SIGNATURE │      │
│  │  - requests      │            │  (ethers.js)      │      │
│  │  - revenue split │            └───────────────────┘      │
│  └──────────────────┘                                        │
│        │                                                      │
│        │                                                      │
│        ▼                                                      │
│  ┌─────────────────────────────────────────────────┐        │
│  │       REVENUE DISTRIBUTION                      │        │
│  │  - Internal Ledger (user_balance_ledger)        │        │
│  │  - Smart Contract (HRKeyRevenueShare) [Phase 2] │        │
│  └─────────────────────────────────────────────────┘        │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Stack Tecnológico

- **Backend**: Node.js + Express
- **Base de Datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth + JWT
- **Emails**: Resend
- **Blockchain**: Base (Optimistic Rollup de Ethereum)
- **Smart Contracts**: Solidity + Hardhat
- **Tokens**: USDC (ERC20)

---

## 💾 Base de Datos

### Tablas Nuevas

#### 1. `data_access_requests`

Almacena todas las solicitudes de acceso a datos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `company_id` | UUID | Empresa solicitante |
| `requested_by_user_id` | UUID | Signer que hizo la solicitud |
| `target_user_id` | UUID | Usuario dueño de los datos |
| `reference_id` | UUID | Referencia específica (opcional) |
| `status` | TEXT | PENDING / APPROVED / REJECTED / EXPIRED |
| `price_amount` | DECIMAL | Monto a cobrar |
| `currency` | TEXT | Moneda (USD) |
| `requested_data_type` | TEXT | reference / profile / full_data |
| `consent_given_at` | TIMESTAMPTZ | Cuándo el usuario aprobó |
| `consent_wallet_signature` | TEXT | Firma de la wallet |
| `payment_status` | TEXT | PENDING / COMPLETED / FAILED |
| `data_accessed` | BOOLEAN | Si ya se consultó |
| `expires_at` | TIMESTAMPTZ | Fecha de expiración (7 días) |

#### 2. `revenue_shares`

Registro del reparto de ingresos por cada solicitud aprobada.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `data_access_request_id` | UUID | Request asociado |
| `company_id` | UUID | Empresa pagadora |
| `target_user_id` | UUID | Usuario que recibe pago |
| `reference_id` | UUID | Referencia asociada |
| `total_amount` | DECIMAL | Monto total |
| `platform_amount` | DECIMAL | Cantidad para HRKey (40%) |
| `user_amount` | DECIMAL | Cantidad para usuario (40%) |
| `ref_creator_amount` | DECIMAL | Cantidad para creador ref (20%) |
| `ref_creator_email` | TEXT | Email del creador |
| `status` | TEXT | PENDING_PAYOUT / PAID |
| `user_paid` | BOOLEAN | Si se pagó al usuario |
| `user_paid_at` | TIMESTAMPTZ | Fecha de pago |

#### 3. `user_balance_ledger`

Ledger interno que rastrea el balance acumulado de cada usuario.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador |
| `user_id` | UUID | Usuario |
| `user_email` | TEXT | Email (para creadores sin cuenta) |
| `total_earned` | DECIMAL | Total ganado |
| `total_paid_out` | DECIMAL | Total pagado |
| `current_balance` | DECIMAL | Balance disponible |
| `min_payout_threshold` | DECIMAL | Mínimo para pagar ($50) |
| `preferred_payout_method` | TEXT | wallet / stripe / bank |
| `wallet_address` | TEXT | Address para payout on-chain |

#### 4. `revenue_transactions`

Log inmutable de todas las transacciones de revenue.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador |
| `user_id` | UUID | Usuario |
| `transaction_type` | TEXT | CREDIT / DEBIT / PAYOUT / REFUND |
| `amount` | DECIMAL | Cantidad |
| `description` | TEXT | Descripción |
| `balance_before` | DECIMAL | Balance antes |
| `balance_after` | DECIMAL | Balance después |
| `external_tx_id` | TEXT | TX hash o payment ID |

#### 5. `data_access_pricing`

Configuración de precios y porcentajes por tipo de dato.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador |
| `data_type` | TEXT | reference / profile / full_data |
| `price_amount` | DECIMAL | Precio (ej: $10) |
| `platform_fee_percent` | DECIMAL | % para plataforma (40) |
| `user_fee_percent` | DECIMAL | % para usuario (40) |
| `ref_creator_fee_percent` | DECIMAL | % para creador (20) |
| `is_active` | BOOLEAN | Activo |

### Vistas SQL

#### `user_pending_data_requests`

Vista que muestra solicitudes pendientes con información agregada:

```sql
SELECT
  dar.id,
  dar.target_user_id,
  c.name as company_name,
  dar.price_amount,
  dar.requested_data_type,
  dar.created_at,
  dar.expires_at
FROM data_access_requests dar
LEFT JOIN companies c ON dar.company_id = c.id
WHERE dar.status = 'PENDING'
  AND dar.expires_at > NOW();
```

#### `user_earnings_summary`

Vista con resumen de ganancias por usuario:

```sql
SELECT
  u.id as user_id,
  u.email,
  COALESCE(ubl.total_earned, 0) as total_earned,
  COALESCE(ubl.current_balance, 0) as current_balance,
  COUNT(DISTINCT rs.id) as total_transactions
FROM users u
LEFT JOIN user_balance_ledger ubl ON u.id = ubl.user_id
LEFT JOIN revenue_shares rs ON u.id = rs.target_user_id
GROUP BY u.id, u.email, ubl.total_earned, ubl.current_balance;
```

---

## 🔌 API Endpoints

### Data Access Endpoints

#### `POST /api/data-access/request`

**Empresa crea solicitud de acceso a datos**

**Requiere**: Autenticación + Company Signer

**Body**:
```json
{
  "companyId": "uuid",
  "targetUserId": "uuid",
  "referenceId": "uuid",  // opcional
  "requestedDataType": "reference",
  "requestReason": "Candidate for Senior Developer position"
}
```

**Response**:
```json
{
  "success": true,
  "request": {
    "id": "uuid",
    "status": "PENDING",
    "priceAmount": 10.00,
    "currency": "USD",
    "expiresAt": "2025-11-26T..."
  }
}
```

---

#### `GET /api/data-access/pending`

**Usuario obtiene solicitudes pendientes**

**Requiere**: Autenticación

**Response**:
```json
{
  "success": true,
  "requests": [
    {
      "id": "uuid",
      "company": {
        "name": "Acme Corp",
        "verified": true
      },
      "dataType": "reference",
      "priceAmount": 10.00,
      "requestReason": "Hiring process",
      "createdAt": "2025-11-19T...",
      "expiresAt": "2025-11-26T..."
    }
  ],
  "total": 1
}
```

---

#### `POST /api/data-access/:requestId/approve`

**Usuario aprueba solicitud con firma de wallet**

**Requiere**: Autenticación

**Body**:
```json
{
  "signature": "0x...",
  "walletAddress": "0x...",
  "message": "Autorizo a HRKey a compartir..."
}
```

**Response**:
```json
{
  "success": true,
  "request": {
    "id": "uuid",
    "status": "APPROVED"
  },
  "revenueShare": {
    "id": "uuid",
    "totalAmount": 10.00,
    "userAmount": 4.00,
    "platformAmount": 4.00,
    "refCreatorAmount": 2.00
  }
}
```

---

#### `POST /api/data-access/:requestId/reject`

**Usuario rechaza solicitud**

**Requiere**: Autenticación

**Response**:
```json
{
  "success": true,
  "request": {
    "id": "uuid",
    "status": "REJECTED"
  }
}
```

---

#### `GET /api/data-access/:requestId/data`

**Empresa obtiene los datos aprobados**

**Requiere**: Autenticación + Company Signer

**Response**:
```json
{
  "success": true,
  "data": {
    "reference": {
      "id": "uuid",
      "referrer_name": "John Doe",
      "overall_rating": 4.8,
      "summary": "...",
      "kpi_ratings": {...}
    }
  },
  "requestId": "uuid",
  "dataType": "reference"
}
```

---

### Revenue Endpoints

#### `GET /api/revenue/balance`

**Obtener balance actual del usuario**

**Response**:
```json
{
  "success": true,
  "balance": {
    "totalEarned": 120.00,
    "totalPaidOut": 50.00,
    "currentBalance": 70.00,
    "currency": "USD",
    "minPayoutThreshold": 50.00,
    "preferredPayoutMethod": "wallet"
  }
}
```

---

#### `GET /api/revenue/shares`

**Obtener historial de revenue shares**

**Query params**: `status`, `limit`, `offset`

**Response**:
```json
{
  "success": true,
  "shares": [
    {
      "id": "uuid",
      "company": {
        "name": "Acme Corp"
      },
      "totalAmount": 10.00,
      "userAmount": 4.00,
      "status": "PENDING_PAYOUT",
      "createdAt": "2025-11-19T..."
    }
  ],
  "total": 15
}
```

---

#### `GET /api/revenue/summary`

**Resumen completo de ganancias**

**Response**:
```json
{
  "success": true,
  "summary": {
    "balance": {
      "total": 120.00,
      "available": 70.00,
      "paidOut": 50.00
    },
    "stats": {
      "totalApprovedRequests": 12,
      "totalRevenueShares": 12,
      "pendingShares": 7,
      "paidShares": 5
    }
  }
}
```

---

#### `POST /api/revenue/payout/request`

**Solicitar payout del balance disponible**

**Body**:
```json
{
  "amount": 70.00,  // opcional (default: balance completo)
  "payoutMethod": "wallet"
}
```

**Response**:
```json
{
  "success": true,
  "payout": {
    "transactionId": "uuid",
    "amount": 70.00,
    "status": "pending",
    "estimatedProcessingTime": "2-5 business days"
  }
}
```

---

## 🔄 Flujo de Negocio Completo

### 1. Empresa Solicita Acceso

```javascript
// Frontend - Company Dashboard
async function requestDataAccess(targetUserId, referenceId) {
  const response = await fetch('/api/data-access/request', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      companyId: currentCompanyId,
      targetUserId,
      referenceId,
      requestedDataType: 'reference',
      requestReason: 'Candidate evaluation for position X'
    })
  });

  const data = await response.json();
  alert(`Request created! Status: ${data.request.status}`);
}
```

### 2. Usuario Recibe Notificación

- Email automático vía Resend
- Dashboard muestra badge con solicitudes pendientes

### 3. Usuario Firma y Aprueba

```javascript
// Frontend - User Dashboard
async function approveDataAccess(requestId) {
  // 1. Obtener wallet del usuario (ya conectada)
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const walletAddress = await signer.getAddress();

  // 2. Crear mensaje para firmar
  const message = `Autorizo a HRKey a compartir mis datos con la empresa solicitante. Request ID: ${requestId}. Fecha: ${new Date().toISOString()}`;

  // 3. Firmar mensaje
  const signature = await signer.signMessage(message);

  // 4. Enviar aprobación al backend
  const response = await fetch(`/api/data-access/${requestId}/approve`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      signature,
      walletAddress,
      message
    })
  });

  const data = await response.json();
  alert(`Approved! You earned $${data.revenueShare.userAmount}`);
}
```

### 4. Backend Procesa Pago y Reparte Ingresos

```javascript
// backend/controllers/dataAccessController.js - approveDataAccessRequest()

// 1. Validar firma (TODO: implementar verificación)
// 2. Cobrar a la empresa (Stripe o ledger interno)
// 3. Crear revenue share
const revenueShare = await createRevenueShare(request);

// 4. Actualizar balance del usuario
await updateUserBalance(userId, userAmount);

// 5. Actualizar balance del creador de referencia
await updateCreatorBalance(refCreatorEmail, refCreatorAmount);

// 6. Cambiar status a APPROVED
```

### 5. Empresa Accede a los Datos

```javascript
// Frontend - Company Dashboard
async function viewApprovedData(requestId) {
  const response = await fetch(`/api/data-access/${requestId}/data`, {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  });

  const data = await response.json();
  displayReference(data.data.reference);
}
```

---

## ⛓️ Smart Contract (Web3)

### Contrato: `HRKeyRevenueShare.sol`

**Ubicación**: `/contracts/HRKeyRevenueShare.sol`

**Funciones Principales**:

```solidity
// Distribuir pago con split automático
function distributePayment(
    bytes32 requestId,
    address profileOwner,
    address refCreator,
    address token,
    uint256 totalAmount
) external;

// Calcular split (sin gas)
function calculateSplit(uint256 totalAmount)
    external view
    returns (uint256 platformAmount, uint256 userAmount, uint256 refCreatorAmount);

// Actualizar porcentajes (solo owner)
function updateFeePercentages(
    uint16 platformPercent,
    uint16 userPercent,
    uint16 refCreatorPercent
) external onlyOwner;
```

### Deployment

```bash
# 1. Compilar contrato
npx hardhat compile

# 2. Configurar variables en .env
PLATFORM_ADDRESS=0x...
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=0x...

# 3. Deploy a Base Sepolia testnet
node scripts/deploy-revenue-share.js

# 4. Guardar address del contrato
REVENUE_SHARE_CONTRACT_ADDRESS=0x...

# 5. Configurar token soportado (USDC)
# TODO: Crear script configure-revenue-share.js
```

### Integración Backend

```javascript
// backend/utils/web3RevenueService.js

import { distributeRevenueOnChain } from './utils/web3RevenueService.js';

// Distribuir pago on-chain
const result = await distributeRevenueOnChain({
  requestId: request.id,
  profileOwnerAddress: user.wallet_address,
  refCreatorAddress: refCreator.wallet_address,
  totalAmount: '10.00',  // USD
  tokenAddress: USDC_ADDRESS
});

if (result.success) {
  console.log('Payment distributed on-chain:', result.txHash);
}
```

---

## ⚙️ Configuración

### Variables de Entorno

Copiar `/backend/.env.example` a `/backend/.env`:

```bash
# Revenue Sharing Config
PLATFORM_FEE_PERCENT=40
USER_FEE_PERCENT=40
REF_CREATOR_FEE_PERCENT=20

DEFAULT_REFERENCE_PRICE=10.00
MIN_PAYOUT_THRESHOLD=50.00

# Web3 (Opcional - Phase 2)
REVENUE_SHARE_CONTRACT_ADDRESS=0x...
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PLATFORM_PRIVATE_KEY=0x...
```

### Migración de Base de Datos

1. Ir al SQL Editor de Supabase
2. Ejecutar `/sql/002_data_access_and_revenue_sharing.sql`

```sql
-- Verificar tablas creadas
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'data_access%'
  OR tablename LIKE 'revenue%';
```

### Inicializar Precios

Los precios por defecto se insertan automáticamente al ejecutar la migración:

```sql
SELECT * FROM data_access_pricing;

-- Resultado:
--  data_type  | price_amount | platform_fee_percent | user_fee_percent | ref_creator_fee_percent
-- ------------|--------------|----------------------|------------------|------------------------
--  reference  |        10.00 |                40.00 |            40.00 |                   20.00
--  profile    |        25.00 |                40.00 |            50.00 |                   10.00
--  full_data  |        50.00 |                40.00 |            45.00 |                   15.00
```

---

## 🚀 Guía de Implementación

### 1. Backend Setup

```bash
cd backend

# Instalar dependencias (ya están en package.json)
npm install

# Configurar .env
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar backend
npm start

# Verificar endpoints
curl http://localhost:3001/health
```

### 2. Database Setup

```bash
# Ir a Supabase Dashboard > SQL Editor

# Ejecutar migración
-- Copiar y pegar contenido de sql/002_data_access_and_revenue_sharing.sql

# Verificar
SELECT * FROM data_access_pricing;
```

### 3. Smart Contract Setup (Opcional - Phase 2)

```bash
# Compilar
npx hardhat compile

# Deploy a testnet
node scripts/deploy-revenue-share.js

# Guardar address en .env
REVENUE_SHARE_CONTRACT_ADDRESS=0x...
```

### 4. Frontend Integration

**Ejemplo: Botón "Solicitar Acceso" en perfil de candidato**

```javascript
// pages/candidate-profile.html

async function requestAccess(candidateId, referenceId) {
  const session = await supabaseClient.auth.getSession();

  const response = await fetch('http://localhost:3001/api/data-access/request', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.data.session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      companyId: currentCompanyId,
      targetUserId: candidateId,
      referenceId: referenceId,
      requestedDataType: 'reference',
      requestReason: 'Hiring process evaluation'
    })
  });

  const data = await response.json();

  if (data.success) {
    alert(`Request sent! Price: $${data.request.priceAmount}`);
  }
}
```

**Ejemplo: Dashboard de solicitudes pendientes (Usuario)**

```javascript
// pages/my-dashboard.html

async function loadPendingRequests() {
  const session = await supabaseClient.auth.getSession();

  const response = await fetch('http://localhost:3001/api/data-access/pending', {
    headers: {
      'Authorization': `Bearer ${session.data.session.access_token}`
    }
  });

  const data = await response.json();

  data.requests.forEach(request => {
    displayRequest(request);
  });
}

async function approveRequest(requestId) {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const walletAddress = await signer.getAddress();

  const message = `Autorizo HRKey a compartir datos. Request: ${requestId}`;
  const signature = await signer.signMessage(message);

  const response = await fetch(`http://localhost:3001/api/data-access/${requestId}/approve`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.data.session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ signature, walletAddress, message })
  });

  const data = await response.json();
  alert(`Approved! You earned $${data.revenueShare.userAmount}`);
  loadPendingRequests(); // Refresh
}
```

---

## 🧪 Testing

### Test Manual de Endpoints

**1. Crear Solicitud**

```bash
curl -X POST http://localhost:3001/api/data-access/request \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "uuid-company",
    "targetUserId": "uuid-user",
    "referenceId": "uuid-reference",
    "requestedDataType": "reference"
  }'
```

**2. Ver Pendientes**

```bash
curl http://localhost:3001/api/data-access/pending \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**3. Aprobar Solicitud**

```bash
curl -X POST http://localhost:3001/api/data-access/REQUEST_ID/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "signature": "0x...",
    "walletAddress": "0x...",
    "message": "Autorizo..."
  }'
```

**4. Ver Balance**

```bash
curl http://localhost:3001/api/revenue/balance \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test de Smart Contract

```bash
# TODO: Crear tests con Hardhat
npx hardhat test
```

---

## 🔮 Próximos Pasos (Phase 2)

### 1. Verificación Real de Firma de Wallet

```javascript
// backend/controllers/dataAccessController.js

import { ethers } from 'ethers';

function verifyWalletSignature(message, signature, expectedAddress) {
  const recoveredAddress = ethers.verifyMessage(message, signature);
  return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
}

// En approveDataAccessRequest:
const isValid = verifyWalletSignature(message, signature, walletAddress);
if (!isValid) {
  return res.status(400).json({ error: 'Invalid signature' });
}
```

### 2. Integración con Stripe (Cobro Real)

```javascript
// Cobrar a la empresa antes de aprobar
const paymentIntent = await stripe.paymentIntents.create({
  amount: Math.round(request.price_amount * 100), // centavos
  currency: 'usd',
  customer: companyStripeCustomerId,
  metadata: {
    requestId: request.id,
    type: 'data_access'
  }
});
```

### 3. Payout On-Chain

```javascript
// Implementar payoutToUser en web3RevenueService.js
const token = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
const amountInUnits = ethers.parseUnits(amount.toString(), 6);
const tx = await token.transfer(walletAddress, amountInUnits);
await tx.wait();
```

### 4. Frontend Completo

- **Dashboard de Empresa**: Ver solicitudes enviadas, datos aprobados.
- **Dashboard de Usuario**: Gestionar solicitudes, ver earnings, solicitar payouts.
- **Notificaciones en Tiempo Real**: WebSockets o Supabase Realtime.

### 5. ZK Proofs (Privacy)

- Usar zkSNARKs para compartir datos sin revelar identidad completa.
- Integrar con Polygon ID o similar.

---

## 📚 Recursos Adicionales

- [Base Network Docs](https://docs.base.org)
- [Supabase Docs](https://supabase.com/docs)
- [Ethers.js v6](https://docs.ethers.org/v6/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/5.x/)
- [Hardhat](https://hardhat.org/docs)

---

## 🆘 Troubleshooting

### "REVENUE_SHARE_CONTRACT_ADDRESS not configured"

**Solución**: Agregar en `.env`:
```
REVENUE_SHARE_CONTRACT_ADDRESS=0x...
```

### "User wallet_address is null"

**Solución**: Asegurarse de que el usuario tenga wallet creada. Ejecutar:
```sql
UPDATE users SET wallet_address = '0x...' WHERE id = 'user-uuid';
```

### "Failed to send email"

**Solución**: Verificar que `RESEND_API_KEY` esté configurada en `.env`.

---

**Autor**: HRKey Development Team
**Fecha**: 2025-11-19
**Versión**: 1.0 (Phase 1 - Web2 Ledger)
