# HRKey Identity & Permissions Layer - Documentation

## 📋 Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Backend API](#backend-api)
4. [Frontend Pages](#frontend-pages)
5. [Testing Guide](#testing-guide)
6. [Future Enhancements](#future-enhancements)

---

## 🎯 Overview

This document describes the **Identity and Permissions Layer** added to HRKey. This system enables:

- **User Identity Verification**: Users can verify their identity to unlock premium features
- **Company Management**: Organizations can be created and verified by superadmins
- **Authorized Signers**: Companies can invite team members (HR managers, recruiters, etc.) as authorized signers
- **Audit Trail**: All sensitive actions are logged for compliance and traceability

### Phase 1 Features (Current)

✅ Internal identity verification (no external KYC provider)
✅ Company creation and verification workflow
✅ Signer invitation system with email notifications (Resend)
✅ Role-based access control (user, admin, superadmin)
✅ Comprehensive audit logging
✅ Frontend UI for all flows

### Phase 2 Features (Future - TODO)

🔮 Integration with external KYC providers (Synaps, Onfido, etc.)
🔮 Web3 wallet integration for signature verification
🔮 Zero-Knowledge Proofs for identity privacy
🔮 On-chain company signer registry (Base blockchain)
🔮 Granular permissions per signer role
🔮 Logo upload to Supabase Storage

---

## 🗄️ Database Schema

### New Tables

#### 1. Extended `users` Table

```sql
-- New columns added to existing users table
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'; -- 'user', 'admin', 'superadmin'
ALTER TABLE users ADD COLUMN wallet_address TEXT;
ALTER TABLE users ADD COLUMN identity_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN kyc_provider TEXT DEFAULT 'manual';
ALTER TABLE users ADD COLUMN kyc_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN kyc_metadata JSONB;
```

**Purpose**: Extends user records with identity verification and role information.

#### 2. `companies` Table

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tax_id TEXT,
  domain_email TEXT, -- '@company.com'
  logo_url TEXT, -- External URL (TODO PHASE 2: Supabase Storage)
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),
  metadata JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Purpose**: Stores company/organization information.

#### 3. `company_signers` Table

```sql
CREATE TABLE company_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id), -- NULL until they accept invitation
  email TEXT NOT NULL,
  wallet_address TEXT, -- TODO PHASE 2: For Web3 signatures
  role TEXT NOT NULL, -- Informational only in Phase 1
  is_active BOOLEAN DEFAULT TRUE,
  invite_token TEXT UNIQUE,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  invited_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_company_email UNIQUE(company_id, email),
  CONSTRAINT unique_company_user UNIQUE(company_id, user_id)
);
```

**Purpose**: Manages authorized signers for companies. All signers have equal permissions in Phase 1.

#### 4. `audit_logs` Table

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  company_id UUID REFERENCES companies(id),
  signer_id UUID REFERENCES company_signers(id),
  action_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Purpose**: Immutable audit trail for all sensitive operations.

### Row Level Security (RLS)

All new tables have RLS policies enabled:

- **Companies**: Users can view companies they're signers of or if they're superadmin
- **Company Signers**: Active signers can view other signers in their company
- **Audit Logs**: Users can view their own logs; superadmins can view all

---

## 🔌 Backend API

### Base URL

- **Local**: `http://localhost:3001`
- **Production**: `https://hrkey.xyz` (or your backend URL)

### Authentication

All endpoints (except public ones) require:

```
Authorization: Bearer <supabase_access_token>
```

Get the token from Supabase session: `session.access_token`

---

### Identity Endpoints

#### POST `/api/identity/verify`

Verify a user's identity (Phase 1: internal verification).

**Headers**: `Authorization: Bearer <token>`

**Body**:
```json
{
  "userId": "uuid",
  "fullName": "John Doe",
  "idNumber": "A123456789",
  "selfieUrl": "https://example.com/selfie.jpg" // Optional
}
```

**Response**:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "identity_verified": true,
    "kyc_verified_at": "2025-11-18T10:30:00Z"
  },
  "message": "Identity verified successfully"
}
```

#### GET `/api/identity/status/:userId`

Get verification status for a user.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "userId": "uuid",
  "verified": true,
  "provider": "manual",
  "verifiedAt": "2025-11-18T10:30:00Z",
  "metadata": {
    "fullName": "John Doe",
    "hasIdNumber": true,
    "hasSelfie": false
  }
}
```

---

### Company Endpoints

#### POST `/api/company/create`

Create a new company.

**Headers**: `Authorization: Bearer <token>`

**Body**:
```json
{
  "name": "Acme Corp",
  "taxId": "RFC123456", // Optional
  "domainEmail": "@acme.com", // Optional
  "logoUrl": "https://acme.com/logo.png", // Optional
  "metadata": { // Optional
    "address": "123 Main St",
    "industry": "Technology"
  }
}
```

**Response**:
```json
{
  "success": true,
  "company": {
    "id": "uuid",
    "name": "Acme Corp",
    "verified": false,
    "createdAt": "2025-11-18T10:30:00Z"
  },
  "message": "Company created successfully. Awaiting verification."
}
```

**Note**: Creator is automatically added as first signer with "Company Admin" role.

#### GET `/api/companies/my`

Get all companies where current user is a signer.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "companies": [
    {
      "id": "uuid",
      "name": "Acme Corp",
      "verified": true,
      "myRole": "HR Manager",
      "joinedAt": "2025-11-18T10:30:00Z"
    }
  ]
}
```

#### GET `/api/company/:companyId`

Get company details (requires being a signer or superadmin).

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "company": {
    "id": "uuid",
    "name": "Acme Corp",
    "taxId": "RFC123456",
    "verified": true,
    "verifiedAt": "2025-11-18T11:00:00Z"
  },
  "stats": {
    "totalSigners": 5,
    "activeSigners": 4
  }
}
```

#### PATCH `/api/company/:companyId`

Update company information (requires being an active signer).

**Headers**: `Authorization: Bearer <token>`

**Body**:
```json
{
  "name": "Acme Corporation", // Optional
  "logoUrl": "https://new-url.com/logo.png" // Optional
}
```

#### POST `/api/company/:companyId/verify`

Verify/unverify a company (**SUPERADMIN ONLY**).

**Headers**: `Authorization: Bearer <token>`

**Body**:
```json
{
  "verified": true,
  "notes": "Verified via business documents"
}
```

---

### Company Signers Endpoints

#### POST `/api/company/:companyId/signers`

Invite a new signer (requires being an active signer).

**Headers**: `Authorization: Bearer <token>`

**Body**:
```json
{
  "email": "hr.manager@acme.com",
  "role": "HR Manager"
}
```

**Response**:
```json
{
  "success": true,
  "signerId": "uuid",
  "inviteToken": "abc123...",
  "emailSent": true,
  "message": "Signer invitation sent successfully"
}
```

**Note**: Sends invitation email via Resend.

#### GET `/api/company/:companyId/signers`

Get all signers for a company.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "signers": [
    {
      "id": "uuid",
      "email": "hr.manager@acme.com",
      "role": "HR Manager",
      "isActive": true,
      "hasAccepted": true,
      "invitedAt": "2025-11-18T10:30:00Z",
      "acceptedAt": "2025-11-18T11:00:00Z",
      "invitedBy": "admin@acme.com"
    }
  ],
  "total": 5,
  "active": 4
}
```

#### PATCH `/api/company/:companyId/signers/:signerId`

Update signer status or role.

**Headers**: `Authorization: Bearer <token>`

**Body**:
```json
{
  "isActive": false, // Deactivate signer
  "role": "Senior Recruiter" // Or change role
}
```

**Note**: Cannot deactivate yourself.

#### GET `/api/signers/invite/:token`

Get invitation details by token (**PUBLIC - no auth required**).

**Response**:
```json
{
  "success": true,
  "invitation": {
    "email": "hr.manager@acme.com",
    "role": "HR Manager",
    "invitedAt": "2025-11-18T10:30:00Z",
    "company": {
      "name": "Acme Corp",
      "verified": true
    }
  }
}
```

#### POST `/api/signers/accept/:token`

Accept a signer invitation (requires authentication).

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "signer": {
    "id": "uuid",
    "companyId": "uuid",
    "role": "HR Manager"
  },
  "company": {
    "id": "uuid",
    "name": "Acme Corp"
  },
  "message": "You've been added as HR Manager to Acme Corp"
}
```

---

### Audit Logs Endpoints

#### GET `/api/audit/logs`

Get audit logs with filtering.

**Headers**: `Authorization: Bearer <token>`

**Query Params**:
- `userId` (optional): Filter by user ID
- `companyId` (optional): Filter by company ID
- `actionType` (optional): Filter by action type
- `limit` (optional, default 50, max 100): Number of results
- `offset` (optional, default 0): Pagination offset

**Response**:
```json
{
  "success": true,
  "logs": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "company_id": "uuid",
      "action_type": "invite_signer",
      "details": { "email": "hr@acme.com", "role": "HR Manager" },
      "created_at": "2025-11-18T10:30:00Z"
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

**Access Control**:
- Superadmins: Can view all logs
- Users: Can only view their own logs or their companies' logs
- Company signers: Can view logs for their companies

#### GET `/api/audit/recent`

Get recent activity for current user's companies (last 10 actions).

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "activity": [
    {
      "action_type": "add_signer",
      "created_at": "2025-11-18T10:30:00Z"
    }
  ]
}
```

---

## 🎨 Frontend Pages

### 1. Identity Verification Page

**URL**: `/WebDapp/identity_verification.html`

**Purpose**: Allow users to verify their identity.

**Features**:
- Form with full name, ID number, and optional selfie URL
- Integrates with `identity-service.js`
- Redirects to dashboard on success

**Usage**:
1. User clicks "Verify Identity" from dashboard
2. Fills out form
3. Submits → backend marks `identity_verified = true`
4. Badge appears on dashboard

---

### 2. Company Dashboard

**URL**: `/WebDapp/company_dashboard.html?companyId=<uuid>`

**Purpose**: Manage company information, signers, and view audit trail.

**Features**:
- Company information card with verification status
- Authorized signers table
- Add signer functionality (opens modal)
- Deactivate/reactivate signers
- Recent activity feed
- Superadmin actions (verify/unverify company)

**Access**: Only accessible to active signers of the company or superadmins.

---

### 3. Company Invitation Page

**URL**: `/WebDapp/company_invite.html?token=<invite_token>`

**Purpose**: Accept signer invitations.

**Features**:
- Displays company name and role
- Checks if user is logged in
- Accepts invitation and associates user_id with signer record
- Redirects to company dashboard on success

**Flow**:
1. Signer receives email with invitation link
2. Clicks link → lands on this page
3. If not logged in: redirect to auth page
4. If logged in: shows "Accept Invitation" button
5. Accepts → becomes active signer

---

### 4. Modified Dashboard (app.html)

**Changes**:
- **Identity Badge**: Shows "✓ Verified" or "Verify Identity" button next to user name
- **Company Dashboard Link**: Shows "My Company" button if user is a signer
- **Auto-loading**: Uses `identity-badge-loader.js` to check status on page load

---

## 🧪 Testing Guide

### Prerequisites

1. **Install Dependencies**:
```bash
cd backend
npm install
```

2. **Configure Environment Variables**:
```bash
cp .env.example .env
# Edit .env and set:
# - SUPABASE_URL
# - SUPABASE_SERVICE_KEY
# - RESEND_API_KEY
# - HRKEY_SUPERADMIN_EMAIL=your-admin@email.com
```

3. **Run Database Migration**:

In Supabase SQL Editor, run:
```bash
/sql/001_identity_and_permissions.sql
```

4. **Start Backend**:
```bash
npm start
# Or for development:
npm run dev
```

---

### Test Scenario 1: User Identity Verification

**Goal**: Verify a user's identity.

**Steps**:

1. **Create a test user** (if not exists):
   - Go to `/WebDapp/auth.html`
   - Sign up with email/password
   - Note the user ID (check Supabase Auth dashboard)

2. **Verify identity**:
   - Log in to HRKey
   - Go to `/WebDapp/app.html`
   - Click "Verify Identity" button
   - Fill form:
     - Full Name: `John Doe`
     - ID Number: `A123456789`
     - Selfie URL: (leave empty)
   - Submit

3. **Verify in database**:
```sql
SELECT id, email, identity_verified, kyc_verified_at
FROM users
WHERE email = 'your-test@email.com';
```

Expected: `identity_verified = true`

4. **Check frontend**:
   - Reload `/WebDapp/app.html`
   - Should see "✓ Verified" badge next to user name

---

### Test Scenario 2: Create and Verify Company

**Goal**: Create a company and verify it as superadmin.

**Steps**:

1. **Set superadmin email**:
   - In `.env`: `HRKEY_SUPERADMIN_EMAIL=admin@hrkey.xyz`
   - Restart backend
   - Create user with that email in Supabase Auth (or sign up)
   - Backend will auto-assign `role = 'superadmin'`

2. **Create company** (as regular user):
   - Use API or create a simple test script:

```javascript
// Test script (run in browser console on app.html)
const createCompany = async () => {
  const session = await supabaseClient.auth.getSession();
  const response = await fetch('http://localhost:3001/api/company/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.data.session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Test Company',
      taxId: 'RFC123456',
      domainEmail: '@testcompany.com'
    })
  });
  const data = await response.json();
  console.log(data);
  return data.company.id;
};

const companyId = await createCompany();
```

3. **Verify company** (as superadmin):
   - Log in with superadmin email
   - Go to company dashboard: `/WebDapp/company_dashboard.html?companyId=<uuid>`
   - Click "Verify Company" button
   - Check database:

```sql
SELECT id, name, verified, verified_at, verified_by
FROM companies
WHERE id = '<company-id>';
```

Expected: `verified = true`, `verified_by = <superadmin-user-id>`

---

### Test Scenario 3: Invite and Accept Signer

**Goal**: Invite a signer to a company and accept the invitation.

**Steps**:

1. **Invite signer** (as company admin):
   - Go to company dashboard
   - Click "Add Signer"
   - Enter:
     - Email: `signer@testcompany.com`
     - Role: `HR Manager`
   - Submit

2. **Check email**:
   - Signer should receive email via Resend
   - Email contains invitation link: `/WebDapp/company_invite.html?token=...`

3. **Accept invitation**:
   - Create/log in as user with email `signer@testcompany.com`
   - Go to invitation URL from email
   - Click "Accept Invitation"

4. **Verify in database**:
```sql
SELECT id, email, role, is_active, user_id, accepted_at
FROM company_signers
WHERE email = 'signer@testcompany.com';
```

Expected: `user_id` populated, `accepted_at` timestamp set

5. **Check dashboard access**:
   - Log in as signer
   - Go to `/WebDapp/app.html`
   - Should see "My Company" button in header
   - Click → lands on company dashboard

---

### Test Scenario 4: Audit Trail

**Goal**: Verify that actions are logged.

**Steps**:

1. **Perform actions**:
   - Verify identity
   - Create company
   - Invite signer
   - Accept signer invitation

2. **Check audit logs** in database:
```sql
SELECT action_type, user_id, company_id, details, created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 10;
```

Expected actions:
- `verify_identity`
- `create_company`
- `invite_signer`
- `accept_signer_invite`

3. **Test API endpoint**:
```javascript
// In browser console (as logged-in user)
const getLogs = async () => {
  const session = await supabaseClient.auth.getSession();
  const response = await fetch('http://localhost:3001/api/audit/logs?limit=10', {
    headers: {
      'Authorization': `Bearer ${session.data.session.access_token}`
    }
  });
  const data = await response.json();
  console.log(data.logs);
};

await getLogs();
```

---

## 🚀 Future Enhancements (Phase 2)

### TODO Items in Code

Search for `TODO PHASE 2` in the codebase to find all planned enhancements:

1. **KYC Integration**:
   - File: `backend/controllers/identityController.js`
   - Replace internal verification with external provider (Synaps, Onfido)
   - Add zkProof verification

2. **Web3 Signature Verification**:
   - File: `backend/controllers/signersController.js`
   - Add EIP-712 signature requirement for sensitive actions
   - Verify wallet ownership

3. **On-Chain Company Registry**:
   - Create `CompanySignersRegistry.sol` contract on Base
   - Store Merkle root of signers on-chain
   - ZK proofs for signer verification without revealing full list

4. **Logo Upload**:
   - File: `sql/001_identity_and_permissions.sql`
   - Migrate `companies.logo_url` to Supabase Storage
   - Add upload endpoints

5. **Granular Permissions**:
   - File: `sql/001_identity_and_permissions.sql`
   - Expand `company_signers.permissions` JSONB field
   - Define permission levels: view, approve, manage

---

## 📝 Summary

### Files Created

**Backend**:
- `/backend/middleware/auth.js` - Authentication middleware
- `/backend/utils/auditLogger.js` - Audit logging utility
- `/backend/utils/emailService.js` - Resend email service
- `/backend/controllers/identityController.js` - Identity endpoints
- `/backend/controllers/companyController.js` - Company endpoints
- `/backend/controllers/signersController.js` - Signer endpoints
- `/backend/controllers/auditController.js` - Audit log endpoints

**Frontend**:
- `/public/WebDapp/js/identity-service.js` - Identity API client
- `/public/WebDapp/js/company-service.js` - Company API client
- `/public/WebDapp/js/identity-badge-loader.js` - Badge auto-loader
- `/public/WebDapp/identity_verification.html` - Verification page
- `/public/WebDapp/company_dashboard.html` - Company management page
- `/public/WebDapp/company_invite.html` - Invitation acceptance page

**Database**:
- `/sql/001_identity_and_permissions.sql` - Schema migration

**Documentation**:
- `/docs/identity-and-signers.md` - This file

### Files Modified

- `/backend/server.js` - Added new routes and superadmin logic
- `/backend/package.json` - Added `resend` dependency
- `/public/WebDapp/app.html` - Added identity badge and company link
- `/.env.example` - Added `HRKEY_SUPERADMIN_EMAIL`

---

## 🆘 Support

For issues or questions:

1. Check audit logs for errors
2. Review browser console for frontend errors
3. Check backend logs for API errors
4. Verify environment variables are set correctly
5. Ensure database migration ran successfully

---

**Last Updated**: 2025-11-18
**Version**: 1.0 (Phase 1)
**Author**: HRKey Development Team
