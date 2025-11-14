# HRKey - Professional References on Blockchain

> Plataforma de referencias profesionales verificadas combinando Web2 y Web3

[![Next.js](https://img.shields.io/badge/Next.js-15.5.3-black)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)](https://supabase.com/)
[![Base](https://img.shields.io/badge/Base-Sepolia-blue)](https://base.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 🎯 ¿Qué es HRKey?

HRKey es una plataforma que permite a profesionales **solicitar, gestionar y verificar referencias laborales** de forma confiable y transparente.

### Características Principales

- ✅ **Referencias Verificadas**: Sistema de invitaciones único por email
- ⛓️ **Blockchain**: Inmutabilidad opcional en Base (L2 de Ethereum)
- 💼 **Dashboard Completo**: Gestiona todas tus referencias en un solo lugar
- 📧 **Emails Automáticos**: Notificaciones a referentes
- 💰 **Plan PRO**: Features avanzadas con pago único ($9.99)
- 🔐 **Wallets Custodiales**: Onboarding fácil sin necesidad de MetaMask

---

## 🚀 Quick Start

### Deploy en 5 minutos

```bash
# 1. Clonar e instalar
git clone https://github.com/OnChainFest/HRkey-App.git
cd HRkey-App/HRkey
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
# Edita .env.local con tus keys

# 3. Deployar a Vercel
npm install -g vercel
vercel --prod
```

**Lee**: [`QUICKSTART.md`](./QUICKSTART.md) para más detalles.

---

## 📚 Documentación

### Para Entender el Proyecto

- **[`UNDERSTANDING.md`](./UNDERSTANDING.md)** ← **Empieza aquí**
  - ¿Qué es HRKey?
  - Componentes principales
  - Flujo de uso
  - Modelo de datos
  - Preguntas frecuentes

### Para Desarrolladores

- **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**
  - Arquitectura completa del sistema
  - Stack tecnológico
  - Diagramas de flujo
  - Explicación de cada servicio
  - Variables de entorno detalladas

### Para Deployment

- **[`DEPLOYMENT.md`](./DEPLOYMENT.md)**
  - Guía paso a paso
  - Configuración de servicios
  - Variables de entorno
  - Troubleshooting
  - Checklist de producción

- **[`QUICKSTART.md`](./QUICKSTART.md)**
  - Deploy rápido en 5 minutos
  - Mínimo necesario

---

## 🏗️ Stack Tecnológico

### Frontend
- **Next.js 15.5.3** (React 19 + Turbopack)
- **Tailwind CSS 4** para estilos
- **OnchainKit** (Coinbase) para Web3
- **Wagmi + Viem** para blockchain

### Backend
- **Supabase** (PostgreSQL + Auth + Storage)
- **Express** (opcional, para lógica compleja)

### Blockchain
- **Base Sepolia** (testnet L2)
- **Hardhat** para smart contracts
- **ethers.js v6** para interacción

### Servicios
- **Resend** - Emails transaccionales
- **Stripe** - Pagos
- **Vercel** - Hosting y CI/CD

---

## 📁 Estructura del Proyecto

```
HRkey-App/
├── HRkey/                    # 🎨 Frontend Next.js
│   ├── src/
│   │   ├── app/              # App Router (pages)
│   │   │   ├── dashboard/    # Dashboard de referencias
│   │   │   ├── ref/verify/   # Página de verificación
│   │   │   └── api/          # API Routes
│   │   ├── components/       # Componentes React
│   │   ├── lib/              # Supabase, contratos
│   │   └── utils/            # Helpers
│   ├── api/                  # API Routes legacy
│   │   ├── kpi-digest.ts     # Cron job
│   │   └── stripe/           # Webhooks
│   └── public/               # Assets estáticos
│
├── backend/                  # 🔧 Backend Express (opcional)
│   ├── server.js             # API principal
│   └── utils/                # Helpers
│
├── contracts/                # 📜 Smart Contracts
│   └── PeerProofRegistry.sol # Contrato principal
│
├── scripts/                  # 🛠️ Scripts de deployment
│   └── deploy.js             # Deploy de contratos
│
├── ARCHITECTURE.md           # 📖 Documentación técnica
├── DEPLOYMENT.md             # 🚀 Guía de deployment
├── UNDERSTANDING.md          # 🎯 Guía conceptual
└── QUICKSTART.md             # ⚡ Quick start
```

---

## 🔄 Flujo de Usuario

```
1️⃣ Usuario solicita referencia
   → Ingresa datos del referente
   → Se crea borrador en Supabase

2️⃣ Usuario envía invitación
   → Se genera token único
   → Referente recibe email con link
   → /ref/verify?token=abc123

3️⃣ Referente completa
   → Abre el link
   → Llena formulario (rating, comentarios)
   → Submit → Se guarda en Supabase

4️⃣ (Opcional) Guardar en blockchain
   → Usuario conecta wallet
   → Paga ~$0.01 de gas
   → Referencia queda inmutable onchain
```

---

## 🔐 Variables de Entorno

### Mínimas (para empezar)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

### Completas (features full)

Ver archivos `.env.example` en:
- `/HRkey/.env.example` - Frontend
- `/backend/.env.example` - Backend
- `/.env.example` - Hardhat (contratos)

**Detalle completo**: [`ARCHITECTURE.md`](./ARCHITECTURE.md#variables-de-entorno-explicadas)

---

## 🧪 Desarrollo Local

```bash
# Frontend (Next.js)
cd HRkey
npm install
npm run dev
# → http://localhost:3000

# Backend (Express) - Terminal separada
cd backend
npm install
npm start
# → http://localhost:3001

# Contratos (Hardhat)
npm run compile          # Compilar contratos
npm run deploy:base-sepolia  # Deploy a Base Sepolia
```

---

## 🧪 Testing

```bash
# Run tests (cuando estén implementados)
cd HRkey
npm test

# Type checking
npm run build  # Verifica TypeScript
```

---

## 📦 Build para Producción

```bash
cd HRkey
npm run build

# Output en .next/
# Listo para deployar en Vercel
```

---

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una branch (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver `LICENSE` para más detalles.

---

## 🙋 Soporte

- **Documentación**: Lee [`UNDERSTANDING.md`](./UNDERSTANDING.md) primero
- **Deployment**: Ver [`DEPLOYMENT.md`](./DEPLOYMENT.md)
- **Issues**: Abre un issue en GitHub
- **Discussions**: Para preguntas generales

---

## 🎓 Recursos

### Aprende las Tecnologías
- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Base Docs](https://docs.base.org/)
- [OnchainKit](https://onchainkit.xyz/)
- [Wagmi](https://wagmi.sh/)

### Tutoriales
- [Building on Base](https://docs.base.org/tutorials/intro)
- [Next.js + Supabase](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)

---

## ⭐ Roadmap

- [ ] Tests automatizados (unit + e2e)
- [ ] Migrar a Base Mainnet
- [ ] Mobile app (React Native)
- [ ] API pública para integraciones
- [ ] Dashboard de analytics
- [ ] Sistema de reputación
- [ ] Integración con LinkedIn

---

## 👥 Equipo

Desarrollado por [OnChainFest](https://github.com/OnChainFest)

---

## 🌟 ¿Te gusta el proyecto?

Si encuentras útil HRKey:
- ⭐ Dale una estrella en GitHub
- 🐦 Compártelo en Twitter
- 📝 Escribe un post sobre tu experiencia

---

**¿Listo para deployar?** → Lee [`DEPLOYMENT.md`](./DEPLOYMENT.md)

**¿Quieres entender el código?** → Lee [`ARCHITECTURE.md`](./ARCHITECTURE.md)

**¿Primera vez?** → Empieza con [`UNDERSTANDING.md`](./UNDERSTANDING.md)
