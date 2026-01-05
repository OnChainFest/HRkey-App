# Company Data Access Request - E2E Testing Checklist

## Prerequisites

1. **Two User Accounts Required:**
   - User A: Company Signer (will create company and request access)
   - User B: Target Candidate (will approve/reject requests)

2. **Environment Setup:**
   - Backend running on `http://localhost:3001`
   - Frontend running on `http://localhost:3000`
   - Real Supabase credentials in `.env.local` and `backend/.env`

3. **Dev Helper:**
   - Access `/dev/auth-helper` to get current user ID and JWT
   - This page only works in development mode
   - Use to copy user IDs for testing

---

## Test Flow: Company Data Access Request (Journey B)

### Phase 1: Sign in as User A (Company Signer)

**1.1 Get User A's ID**
```
URL: http://localhost:3000/dev/auth-helper
Action: Sign in as User A, copy the User ID
Expected: Shows User A's ID and email
```

---

### Phase 2: Company Onboarding (B1)

**2.1 Create Company Profile**
```
URL: http://localhost:3000/company/onboarding
Action: Fill form with:
  - Company Name: "Test Company" (required)
  - Domain Email: "test@example.com" (optional)
  - Tax ID: "12-3456789" (optional)
Action: Click "Create Company"
Expected:
  ✓ Success message appears
  ✓ Redirects to /company/dashboard after 1.5s
```

**2.2 Verify Existing Company Redirect**
```
URL: http://localhost:3000/company/onboarding
Expected:
  ✓ Shows "Company Already Exists" message
  ✓ Redirects to dashboard automatically
```

---

### Phase 3: Company Dashboard (B2)

**3.1 View Company Info**
```
URL: http://localhost:3000/company/dashboard
Expected:
  ✓ Shows company name
  ✓ Shows verification status (badge: "Pending Verification" in yellow)
  ✓ Shows tax_id and domain_email if provided
  ✓ Shows "No data access requests yet" (empty state)
  ✓ Shows "Create New Request" button
```

---

### Phase 4: Get User B's ID (Target Candidate)

**4.1 Sign out and sign in as User B**
```
Action: Sign out from User A's session
Action: Sign in as User B
```

**4.2 Get User B's ID**
```
URL: http://localhost:3000/dev/auth-helper
Action: Copy User B's ID
Expected: Shows User B's ID and email
Note: Save this ID - you'll need it for creating the request
```

**4.3 Sign out and sign back in as User A**
```
Action: Sign out from User B
Action: Sign in as User A (Company Signer)
```

---

### Phase 5: Create Data Access Request (B3)

**5.1 Access Request Creation Page**
```
URL: http://localhost:3000/company/data-access/new
Expected:
  ✓ Shows form with fields:
    - Target User ID (required)
    - Data Type dropdown (default: "reference")
    - Purpose/Reason (optional textarea)
  ✓ Shows "Submit Request" button
```

**5.2 Create Request**
```
Action: Fill form with:
  - Target User ID: [User B's ID from step 4.2]
  - Data Type: "reference"
  - Purpose: "Background verification for hiring"
Action: Click "Submit Request"
Expected:
  ✓ Request created successfully
  ✓ Redirects to /company/data-access/[requestId]
  ✓ Note the requestId from the URL for later testing
```

---

### Phase 6: View Request Status (B4)

**6.1 Request Detail Page - Pending Status**
```
URL: http://localhost:3000/company/data-access/[requestId]
Expected:
  ✓ Shows request status badge (yellow "⏳ PENDING")
  ✓ Shows status message: "Your request is waiting for the candidate to approve or reject it."
  ✓ Shows company info
  ✓ Shows target user ID
  ✓ Shows request details (data type, price, currency)
  ✓ Shows timestamps (created, expires)
  ✓ "View Candidate Data" button is DISABLED (not approved yet)
```

**6.2 Verify API Endpoint**
```
Test: curl -H "Authorization: Bearer [User A JWT]" http://localhost:3001/api/data-access/request/[requestId]
Expected:
  ✓ HTTP 200
  ✓ Returns JSON with:
    - status: "PENDING"
    - targetUserId: [User B's ID]
    - requestedDataType: "reference"
    - company object with name, verified, etc.
```

---

### Phase 7: Approve Request (as Target User)

**7.1 Sign out and sign in as User B (Target Candidate)**
```
Action: Sign out from User A
Action: Sign in as User B
```

**7.2 Approve the Request**
```
Backend API Call:
POST http://localhost:3001/api/data-access/[requestId]/approve
Headers:
  Authorization: Bearer [User B JWT]
Body:
  {
    "signature": "0x1234567890abcdef" (can be a test signature for now)
  }

Expected:
  ✓ HTTP 200
  ✓ Response: { "success": true, "request": {...} }
  ✓ request.status: "APPROVED"
  ✓ request.consentGivenAt: [timestamp]
```

---

### Phase 8: View Approved Request (as Company Signer)

**8.1 Sign out and sign in as User A**
```
Action: Sign out from User B
Action: Sign in as User A (Company Signer)
```

**8.2 View Request Status - Approved**
```
URL: http://localhost:3000/company/data-access/[requestId]
Expected:
  ✓ Status badge is green "✓ APPROVED"
  ✓ Status message: "The candidate has approved your data access request. You can now view the data."
  ✓ "View Candidate Data" button is ENABLED
  ✓ Shows consent timestamp
```

**8.3 Access Candidate Data (B4 - Data Page)**
```
URL: http://localhost:3000/company/data-access/[requestId]/data
OR
Action: Click "View Candidate Data" button from previous page
Expected:
  ✓ Shows evaluation data (HRKey score, signals, reference analysis)
  ✓ Shows access count incremented
  ✓ Shows data accessed timestamp
```

---

### Phase 9: Dashboard Verification

**9.1 Return to Dashboard**
```
URL: http://localhost:3000/company/dashboard
Expected:
  ✓ Shows company info
  ✓ Shows "Recent Requests" section
  ✓ Lists the created request with:
    - Request ID
    - Status badge (green "APPROVED")
    - Target user ID
    - Data type
    - Created date
    - Link to request detail page
```

---

## Error Cases to Test

### E1: Unauthorized Access
```
Test: Access /company/data-access/[requestId] without signing in
Expected: Shows "Please sign in to view this request" error
```

### E2: Permission Denied
```
Test: Sign in as User C (not company signer or target user)
Test: Access /company/data-access/[requestId]
Expected: HTTP 403 or "You don't have permission to view this request"
```

### E3: Request Not Found
```
Test: Access /company/data-access/nonexistent-id
Expected: "Request not found" error
```

### E4: View Data Before Approval
```
Test: Access /company/data-access/[requestId]/data when status is PENDING
Expected: HTTP 403 or error message "Request must be approved first"
```

### E5: Create Request Without Company
```
Test: Sign in as user without company
Test: Access /company/data-access/new
Expected: Redirects to /company/onboarding OR shows error
```

### E6: Duplicate Request
```
Test: Create another request for same target user while previous is PENDING
Expected: Error "There is already a pending request for this user"
```

---

## Backend Endpoint Reference

### Company Endpoints
- `POST /api/company/create` - Create company (auth required)
- `GET /api/companies/my` - Get my companies (auth required)
- `GET /api/company/:companyId` - Get company details (company signer required)
- `GET /api/company/:companyId/data-access/requests` - List company requests (company signer required)

### Data Access Request Endpoints
- `POST /api/data-access/request` - Create request (auth required)
- `GET /api/data-access/request/:requestId` - Get request details (auth required, must be signer or target)
- `POST /api/data-access/:requestId/approve` - Approve request (auth required, must be target user)
- `POST /api/data-access/:requestId/reject` - Reject request (auth required, must be target user)
- `GET /api/data-access/:requestId/data` - Get evaluation data (auth required, must be signer, request must be approved)

---

## Status Values

### Request Status (uppercase in DB/API)
- `PENDING` - Waiting for candidate approval
- `APPROVED` - Candidate approved, data accessible
- `REJECTED` - Candidate declined
- `EXPIRED` - Request expired without approval

### Payment Status
- `PENDING` - Payment not processed
- `COMPLETED` - Payment successful
- `FAILED` - Payment failed

---

## Quick Test Commands

### Get JWT Token (from browser console on /dev/auth-helper)
```javascript
// Run in browser console after signing in
const session = await supabase.auth.getSession();
console.log('JWT:', session.data.session.access_token);
console.log('User ID:', session.data.session.user.id);
```

### Test Backend Endpoint
```bash
# Replace [JWT] and [requestId] with actual values
curl -H "Authorization: Bearer [JWT]" \
  http://localhost:3001/api/data-access/request/[requestId]
```

### Approve Request via cURL
```bash
curl -X POST \
  -H "Authorization: Bearer [User B JWT]" \
  -H "Content-Type: application/json" \
  -d '{"signature":"0xtest123"}' \
  http://localhost:3001/api/data-access/[requestId]/approve
```

---

## Common Issues & Fixes

### Issue: "Please sign in" on all pages
**Fix:** Check that `.env.local` has correct `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Issue: Backend returns 401 for all requests
**Fix:** Check JWT is being sent in Authorization header. Verify backend `.env` has correct `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`

### Issue: Company pages return 404
**Fix:** Ensure pages are in `app/company/` not `src/app/company/`

### Issue: Field name errors (taxId vs tax_id)
**Fix:** Frontend types should use snake_case to match backend responses

---

## Success Criteria

✅ All 9 phases complete without errors
✅ Company creation works with redirect
✅ Dashboard shows company info and requests
✅ Request creation succeeds with valid target user
✅ Status changes from PENDING → APPROVED after approval
✅ Data page loads only when approved
✅ Error cases handled gracefully with clear messages
✅ Production build passes (`npm run build`)

---

## Notes

- This flow requires NO Stripe integration (per requirements)
- No chatbot features needed (per requirements)
- All endpoints follow existing backend patterns
- Minimal UI focused on functionality over aesthetics
- Real Supabase auth ensures production-ready testing
