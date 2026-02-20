# HRKey Grant-Ready Architecture Specification

**Version:** 1.0.0
**Status:** Normative
**Authors:** Architects of Change Protocol (AOC) / HRKey Protocol Team
**Target Grant:** Base Builder Grants
**Last Updated:** 2026-02-20

---

## Table of Contents

1. [Reference Object Model](#section-1--reference-object-model)
2. [Selective Disclosure Mechanism](#section-2--selective-disclosure-mechanism)
3. [End-to-End Flow](#section-3--end-to-end-flow)
4. [Smart Contract Requirements](#section-4--smart-contract-requirements)
5. [Grant-Ready Milestone Definition](#section-5--grant-ready-milestone-definition)
6. [Security Analysis](#section-6--security-analysis)

---

## SECTION 1 — Reference Object Model

### Overview

All canonical objects in the HRKey protocol are serialized using deterministic JSON (RFC 8785 compatible key-sorted UTF-8) and hashed with SHA-256. Signatures use secp256k1 (EIP-191 personal_sign or EIP-712 typed data). All DIDs use the `did:ethr:base:` method to bind identity to the Base network.

---

### 1.1 ReferenceObject

A `ReferenceObject` represents a verified professional reference. It contains field-level hash commitments enabling selective disclosure without exposing raw data.

#### Canonical Structure

```json
{
  "spec_version": "1.0.0",
  "object_type": "ReferenceObject",
  "ref_id": "<uuid-v4>",
  "subject_did": "did:ethr:base:<0x_wallet_address>",
  "author_did":  "did:ethr:base:<0x_wallet_address>",
  "author_company_id": "<uuid-v4 | null>",
  "created_at": "<ISO-8601 UTC>",
  "expires_at": "<ISO-8601 UTC | null>",
  "field_salts": {
    "COMMENT": "salts are stored ONLY in vault; never included in this canonical form"
  },
  "field_hashes": {
    "relationship":             "sha256:<hex>",
    "duration_months":          "sha256:<hex>",
    "skills":                   "sha256:<hex>",
    "recommendation_strength":  "sha256:<hex>",
    "full_text":                "sha256:<hex>",
    "performance_rating":       "sha256:<hex>"
  },
  "root_hash": "sha256:<merkle_root_of_sorted_field_hashes>",
  "author_signature": "0x<eip191_sig_over_root_hash>",
  "anchor_tx": "<0x_tx_hash | null>",
  "anchor_block": "<uint64 | null>",
  "anchor_contract": "<0x_contract_address | null>",
  "chain_id": 8453
}
```

#### Field Hash Derivation

Each field hash is computed as:

```
field_hash[k] = SHA256( ref_id || ":" || field_name || ":" || field_value_canonical || ":" || field_salt[k] )
```

Where:
- `ref_id` — UUID of the reference (binds hash to this reference)
- `field_name` — Lowercase ASCII key name (e.g. `"relationship"`)
- `field_value_canonical` — RFC 8785 canonical JSON of the field value
- `field_salt[k]` — 32-byte cryptographically random hex string, unique per field, stored **only** in vault

#### Root Hash Derivation

```
root_hash = SHA256( canonical_JSON({ field_hashes }) )
```

Where `canonical_JSON` produces RFC 8785 key-sorted JSON with no whitespace.

#### Author Signature

```
author_signature = EIP-191 personal_sign( root_hash, author_private_key )
```

#### Signer Requirements

| Signer | Requirement |
|--------|-------------|
| Author (Reviewer) | Must hold a registered `company_signer` wallet linked to a verified company |
| Issuer (Backend) | Must be the `issuer` address registered in `HRKAnchorRegistry` |

#### Consent Binding

The `ReferenceObject` is **not** consent-bound by itself. Consent is bound via `ConsentObject.ref_id`. A reference cannot be disclosed without a valid linked `ConsentObject`.

---

### 1.2 ConsentObject

A `ConsentObject` is a cryptographically signed authorization by the subject (candidate) granting a named verifier (recruiter/company) the right to receive a disclosure proof for specific fields of a specific reference.

#### Canonical Structure

```json
{
  "spec_version": "1.0.0",
  "object_type": "ConsentObject",
  "consent_id": "<uuid-v4>",
  "subject_did": "did:ethr:base:<0x_wallet_address>",
  "grantee_did": "did:ethr:base:<0x_wallet_address>",
  "grantee_company_id": "<uuid-v4 | null>",
  "ref_id": "<uuid-v4>",
  "verifier_request_id": "<uuid-v4 | null>",
  "purpose": "hiring_decision | background_check | research | verification",
  "disclosed_fields": [
    "relationship",
    "duration_months",
    "recommendation_strength"
  ],
  "valid_from": "<ISO-8601 UTC>",
  "valid_to": "<ISO-8601 UTC | null>",
  "nonce": "<32-byte random hex>",
  "subject_signature": "0x<eip191_sig_over_consent_hash>",
  "consent_hash": "sha256:<hash_of_canonical_consent_body>",
  "anchor_tx": "<0x_tx_hash | null>",
  "anchor_block": "<uint64 | null>",
  "anchor_contract": "<0x_contract_address | null>",
  "chain_id": 8453
}
```

#### Consent Hash Derivation

The consent body (all fields except `subject_signature`, `consent_hash`, `anchor_tx`, `anchor_block`) is canonicalized and hashed:

```
consent_body = canonical_JSON({
  spec_version, object_type, consent_id, subject_did, grantee_did,
  grantee_company_id, ref_id, verifier_request_id, purpose,
  disclosed_fields, valid_from, valid_to, nonce
})

consent_hash = SHA256( consent_body )
```

#### Subject Signature

```
subject_signature = EIP-191 personal_sign( consent_hash, subject_private_key )
```

The signature proves the subject (candidate) explicitly authorized this specific disclosure to this specific grantee for this specific purpose with this specific nonce.

#### Binding Requirements

- `consent_id` MUST be unique globally
- `nonce` MUST be unique per consent (prevents replay)
- `disclosed_fields` MUST be a subset of fields present in the linked `ReferenceObject.field_hashes`
- `valid_to` SHOULD be set (open-ended consents increase risk surface)

---

### 1.3 DisclosureProofObject

A `DisclosureProofObject` is the cryptographic artifact delivered to a verifier. It proves existence, authenticity, and consent-bounded disclosure of reference fields **without** exposing vault contents or raw reference text.

#### Canonical Structure

```json
{
  "spec_version": "1.0.0",
  "object_type": "DisclosureProofObject",
  "proof_id": "<uuid-v4>",
  "ref_id": "<uuid-v4>",
  "consent_id": "<uuid-v4>",
  "verifier_request_id": "<uuid-v4>",
  "created_at": "<ISO-8601 UTC>",
  "disclosed_fields": {
    "relationship": {
      "value": "Direct Manager",
      "field_hash": "sha256:<hex>",
      "merkle_path": ["sha256:<sibling>", "sha256:<sibling>"],
      "merkle_root": "sha256:<hex>"
    },
    "recommendation_strength": {
      "value": "Strong",
      "field_hash": "sha256:<hex>",
      "merkle_path": ["sha256:<sibling>", "sha256:<sibling>"],
      "merkle_root": "sha256:<hex>"
    }
  },
  "undisclosed_field_hashes": {
    "full_text":          "sha256:<hex>",
    "skills":             "sha256:<hex>",
    "performance_rating": "sha256:<hex>"
  },
  "reference_anchor": {
    "tx_hash":          "0x<hash>",
    "block_number":     12345678,
    "contract_address": "0x<address>",
    "chain_id":         8453
  },
  "consent_anchor": {
    "tx_hash":          "0x<hash>",
    "block_number":     12345680,
    "contract_address": "0x<address>",
    "chain_id":         8453
  },
  "issuer_signature": "0x<eip191_sig_over_proof_hash>",
  "proof_hash": "sha256:<hash_of_canonical_proof_body>"
}
```

#### Proof Verification Algorithm (Verifier Side)

```
FOR each field_name IN disclosed_fields:
  1. recompute field_hash = SHA256(ref_id + ":" + field_name + ":" + canonical(value) + ":")
     NOTE: salt is NOT known to verifier — verifier checks hash against on-chain root instead
  2. verify disclosed_fields[field_name].field_hash == field_hash
     (skip salt: verifier verifies hash commitment via merkle_path to root)
  3. verify merkle_path proves field_hash is leaf in merkle_root
  4. verify merkle_root == reference_anchor root (retrieved from chain)

5. verify reference_anchor.tx_hash exists on Base chain
6. verify consent_anchor.tx_hash exists on Base chain
7. verify issuer_signature over proof_hash
8. verify consent is not expired/revoked
```

> **Note on salt-free verification:** The verifier cannot recompute the field hash from value alone (salt is unknown). Instead, the field hash is provided in the proof and its membership in the on-chain Merkle root is proven via merkle_path. This is the standard Merkle selective disclosure model — the hash commitment authenticates membership without requiring the salt.

---

### 1.4 VerifierRequestObject

A `VerifierRequestObject` is a signed request from a recruiter/verifier asking a candidate to disclose specific fields from a specific reference.

#### Canonical Structure

```json
{
  "spec_version": "1.0.0",
  "object_type": "VerifierRequestObject",
  "request_id": "<uuid-v4>",
  "verifier_did": "did:ethr:base:<0x_wallet_address>",
  "verifier_company_id": "<uuid-v4 | null>",
  "subject_did": "did:ethr:base:<0x_wallet_address>",
  "ref_id": "<uuid-v4>",
  "requested_fields": [
    "relationship",
    "duration_months",
    "recommendation_strength"
  ],
  "purpose": "hiring_decision",
  "created_at": "<ISO-8601 UTC>",
  "expires_at": "<ISO-8601 UTC>",
  "nonce": "<32-byte random hex>",
  "verifier_signature": "0x<eip191_sig_over_request_hash>",
  "request_hash": "sha256:<hash_of_canonical_request_body>",
  "status": "pending | consent_granted | proof_generated | verified | expired | denied"
}
```

#### Request Hash Derivation

```
request_body = canonical_JSON({
  spec_version, object_type, request_id, verifier_did, verifier_company_id,
  subject_did, ref_id, requested_fields, purpose, created_at, expires_at, nonce
})

request_hash = SHA256( request_body )
```

#### Status Transitions

```
pending ──► consent_granted ──► proof_generated ──► verified
   │
   ├──► expired  (if expires_at passed before consent)
   └──► denied   (if subject explicitly denies)
```

---

## SECTION 2 — Selective Disclosure Mechanism

### 2.1 Design Comparison

| Criterion | Option A: Hash Commitments | Option B: Merkle Disclosure | Option C: ZK Proofs |
|-----------|---------------------------|----------------------------|---------------------|
| Implementation complexity | Low | Medium | Very High |
| On-chain storage cost | ~32 bytes/reference | ~32 bytes/reference | ~32 bytes/reference |
| Verifier computation | O(n) hash checks | O(log n) path verification | O(1) proof verify |
| Privacy level | Field-level | Field-level | Claim-level |
| Auditability | Full hash trail | Full hash trail | Proof only |
| ZK-ready design | Partially | Yes (leaves are preimages) | Native |
| MVP feasibility | Yes | Yes | No |

### 2.2 Recommendation

**MVP Phase (now):** Implement **Option B — Merkle Selective Disclosure** with field-level SHA-256 commitments as leaf nodes. This satisfies grant requirements immediately and is structurally compatible with future ZK upgrade.

**Scale Phase (Q3+):** Upgrade to **Option C** by treating Merkle leaves as ZK circuit inputs. The field hash structure is designed to be ZK-preimage-compatible.

### 2.3 Merkle Selective Disclosure — MVP Implementation

#### Leaf Construction

```
leaf[i] = SHA256( ref_id || ":" || field_name[i] || ":" || field_value_canonical[i] || ":" || field_salt[i] )
```

Fields are sorted lexicographically by key name before tree construction.

#### Merkle Tree Construction

```
Given n leaves [L0, L1, ..., Ln-1] (n padded to next power of 2):

Level 0 (leaves): L0, L1, ..., Ln-1
Level 1:          H(L0||L1), H(L2||L3), ...
...
Root:             merkle_root
```

Hash function: `SHA256(left_child || right_child)` (concatenated bytes)

#### Merkle Root Anchoring

`merkle_root` == `ReferenceObject.root_hash` anchored on Base via `HRKAnchorRegistry.anchorReferenceHash(merkle_root)`.

#### Proof Generation (Disclosed Field)

For each field to disclose, generate `merkle_path = [sibling_at_level_0, sibling_at_level_1, ...]` from leaf to root.

#### Proof Verification (Verifier)

```javascript
function verifyMerklePath(leaf, path, root) {
  let current = leaf;
  for (const sibling of path) {
    // Convention: sort to ensure deterministic ordering
    const [left, right] = current < sibling ? [current, sibling] : [sibling, current];
    current = SHA256(left + right);
  }
  return current === root;
}
```

#### What the Verifier Learns

- **Disclosed fields:** Value + proof that the hash is in the committed Merkle tree
- **Undisclosed fields:** Only the field hash (no value, no salt)
- **Never learns:** Raw reference text, other field values, vault contents, field salts

### 2.4 ZK-Compatibility Design Notes (Future)

The current field hash structure:
```
leaf = SHA256(ref_id || ":" || field_name || ":" || field_value || ":" || salt)
```

Is compatible with Poseidon hash (ZK-friendly) substitution at the leaf level in a future upgrade. The Merkle root anchor on-chain stays identical — only the leaf hash function changes. This means:

1. All existing anchors remain valid
2. New references can opt into Poseidon leaves
3. ZK circuits prove `Poseidon(inputs) == leaf` without revealing inputs

---

## SECTION 3 — End-to-End Flow

### 3.1 Full Lifecycle Sequence

```
ACTOR KEY:
  [C] = Candidate (subject)
  [R] = Reviewer (reference author)
  [B] = Backend / Issuer Service
  [V] = Verifier (recruiter/company)
  [BC] = Base Chain (HRKAnchorRegistry contract)

═══════════════════════════════════════════════════════════════
STEP 1: REFERENCE CREATION
═══════════════════════════════════════════════════════════════

[R] ──► POST /api/references
        { text, relationship, duration, skills, rating, subject_did }

[B]     1a. Validate author is registered company_signer
        1b. Generate ref_id (UUID v4)
        1c. Generate field_salts (32 random bytes per field) ── Store in VAULT only
        1d. Compute field_hashes per §1.1 derivation
        1e. Build Merkle tree; derive merkle_root
        1f. Construct ReferenceObject (without anchor_tx)
        1g. Store encrypted reference text in Vault (Supabase encrypted)
        1h. Store ReferenceObject in DB (references table)

[B] ──► Return: { ref_id, root_hash, status: "pending_anchor" }

═══════════════════════════════════════════════════════════════
STEP 2: VAULT STORAGE
═══════════════════════════════════════════════════════════════

[B]     2a. Store field_salts in sdl_statements vault (encrypted, key = ref_id)
        2b. Store full reference text encrypted at rest (AES-256-GCM)
        2c. Store ReferenceObject canonical JSON in references table
        2d. SDL provenance entry: { ref_id, root_hash, created_at, author_did }

═══════════════════════════════════════════════════════════════
STEP 3: HASH ANCHORING ON BASE
═══════════════════════════════════════════════════════════════

[B]     3a. Compute: anchor_payload = { ref_id, root_hash, subject_did, author_did, chain_id: 8453 }
        3b. Call HRKAnchorRegistry.anchorReferenceHash(bytes32(root_hash), ref_id_bytes)

[BC]    3c. Emit AnchorRecorded(root_hash, recorder, block.timestamp)
        3d. Store in mapping: referenceAnchors[root_hash] = { recorder, timestamp, exists: true }

[B]     3e. Receive tx_hash + block_number from receipt
        3f. Update ReferenceObject: { anchor_tx, anchor_block, anchor_contract }
        3g. Update DB record: references.anchor_tx = tx_hash

═══════════════════════════════════════════════════════════════
STEP 4: VERIFIER REQUEST
═══════════════════════════════════════════════════════════════

[V] ──► POST /api/verifier/request
        {
          verifier_did, verifier_company_id,
          subject_did, ref_id,
          requested_fields: ["relationship", "duration_months", "recommendation_strength"],
          purpose: "hiring_decision",
          expires_at: "2026-03-01T00:00:00Z",
          verifier_signature
        }

[B]     4a. Validate verifier_signature over request_hash
        4b. Validate verifier is registered (company + wallet)
        4c. Validate ref_id exists and is Active (not Suppressed/Revoked)
        4d. Validate requested_fields ⊆ ReferenceObject.field_hashes.keys()
        4e. Generate nonce (32 random bytes)
        4f. Construct VerifierRequestObject; persist to DB
        4g. Notify [C] via notification service

[B] ──► Return: { request_id, status: "pending" }
[C] ◄── Notification: "Recruiter X requested verification of reference Y"

═══════════════════════════════════════════════════════════════
STEP 5: CONSENT ISSUANCE
═══════════════════════════════════════════════════════════════

[C] ──► POST /api/verifier/consent
        {
          request_id,
          consent_id (new UUID),
          disclosed_fields: ["relationship", "duration_months", "recommendation_strength"],
          valid_to: "2026-04-01T00:00:00Z",
          subject_signature
        }

[B]     5a. Validate subject owns the reference (subject_did match)
        5b. Validate subject_signature over consent_hash
        5c. Validate disclosed_fields ⊆ requested_fields (subject may grant fewer fields)
        5d. Validate consent nonce is unique (prevent replay)
        5e. Construct ConsentObject; compute consent_hash
        5f. Persist ConsentObject to DB; update request status → "consent_granted"
        5g. Call HRKAnchorRegistry.registerConsentHash(bytes32(consent_hash), consent_id_bytes)

[BC]    5h. Emit ConsentRegistered(consent_hash, recorder, block.timestamp)
        5i. Store in mapping: consentAnchors[consent_hash] = { recorder, timestamp, valid: true }

[B]     5j. Receive tx_hash; update ConsentObject with anchor data

[B] ──► Return: { consent_id, status: "consent_granted" }

═══════════════════════════════════════════════════════════════
STEP 6: DISCLOSURE PROOF GENERATION
═══════════════════════════════════════════════════════════════

[B]     6a. Load ReferenceObject from DB (including field_hashes, root_hash)
        6b. Load field_salts from Vault for disclosed_fields only
        6c. Load encrypted field values from Vault; decrypt
        6d. Recompute field_hashes for disclosed fields to verify vault integrity
        6e. Reconstruct Merkle tree (all leaves from field_hashes)
        6f. For each disclosed field: generate merkle_path from leaf to root
        6g. Construct DisclosureProofObject:
            - disclosed_fields: { field_name: { value, field_hash, merkle_path, merkle_root } }
            - undisclosed_field_hashes: { remaining fields → their hashes only }
            - reference_anchor: from ReferenceObject
            - consent_anchor: from ConsentObject
        6h. Compute proof_hash = SHA256(canonical_JSON(proof_body))
        6i. Sign: issuer_signature = EIP-191 sign(proof_hash, issuer_key)
        6j. Persist DisclosureProofObject to DB; update request status → "proof_generated"

[B] ──► Deliver proof to [V] (via secure channel / API response)

═══════════════════════════════════════════════════════════════
STEP 7: VERIFIER VALIDATION
═══════════════════════════════════════════════════════════════

[V]     7a. Receive DisclosureProofObject
        7b. For each disclosed field:
            - Recompute field_hash = SHA256(ref_id + ":" + field_name + ":" + canonical(value) + ":")
              NOTE: salt not known; verify hash membership via merkle_path instead
            - Verify merkle_path proves field_hash is leaf in merkle_root (§2.3)
        7c. Call HRKAnchorRegistry.verifyReferenceAnchor(root_hash)
            → confirms root_hash was anchored on Base with timestamp
        7d. Call HRKAnchorRegistry.verifyConsent(consent_hash)
            → confirms consent was registered and is not revoked
        7e. Verify issuer_signature over proof_hash using known issuer address
        7f. Verify consent valid_to > now
        7g. Verify verifier_did in proof == own DID

[V] ──► Verification result: { valid: true, anchored_at: <timestamp>, fields_verified: [...] }
```

---

### 3.2 State Machine Summary

```
Reference:     CREATED ──► ANCHORED ──► SUPPRESSED (by candidate)
                                   └──► REVOKED    (by reviewer)

VerifierReq:   PENDING ──► CONSENT_GRANTED ──► PROOF_GENERATED ──► VERIFIED
                     └──► EXPIRED (timeout)
                     └──► DENIED  (candidate denies)

Consent:       ACTIVE ──► REVOKED (by candidate)
                    └──► EXPIRED (via valid_to)

ConsentAnchor: REGISTERED ──► REVOKED_ON_CHAIN
```

---

## SECTION 4 — Smart Contract Requirements

### 4.1 Contract: `HRKAnchorRegistry`

**Purpose:** Single minimal contract combining reference hash anchoring and consent hash registration. Replaces the existing `HRKReferenceProof.sol` and extends it with consent management.

**Network:** Base Mainnet (chain_id: 8453) + Base Sepolia (chain_id: 84532) for testing

#### Storage Structure

```solidity
// Gas-efficient packed structs (fits in 2 storage slots per entry)
struct ReferenceAnchor {
    address recorder;   // slot 0: 20 bytes
    uint64  timestamp;  // slot 0: 8 bytes  (fits with address)
    bool    exists;     // slot 0: 1 byte
    // 3 bytes padding (slot 0 used: 29/32 bytes)
}

struct ConsentAnchor {
    address recorder;   // slot 0: 20 bytes
    uint64  timestamp;  // slot 0: 8 bytes
    bool    exists;     // slot 0: 1 byte
    bool    revoked;    // slot 0: 1 byte
    // 2 bytes padding (slot 0 used: 30/32 bytes)
}

mapping(bytes32 => ReferenceAnchor) private referenceAnchors;
mapping(bytes32 => ConsentAnchor)   private consentAnchors;
```

#### Required Functions

| Function | Visibility | Mutability | Access |
|----------|-----------|------------|--------|
| `anchorReferenceHash(bytes32 refHash, bytes32 refId)` | external | state-changing | only issuer |
| `verifyReferenceAnchor(bytes32 refHash)` | external | view | public |
| `registerConsentHash(bytes32 consentHash, bytes32 consentId)` | external | state-changing | only issuer |
| `verifyConsent(bytes32 consentHash)` | external | view | public |
| `revokeConsentHash(bytes32 consentHash)` | external | state-changing | only issuer |
| `setIssuer(address newIssuer)` | external | state-changing | only owner |
| `transferOwnership(address newOwner)` | external | state-changing | only owner |

#### Required Events

```solidity
event ReferenceAnchored(bytes32 indexed refHash, bytes32 indexed refId, address indexed recorder, uint64 timestamp);
event ConsentRegistered(bytes32 indexed consentHash, bytes32 indexed consentId, address indexed recorder, uint64 timestamp);
event ConsentRevoked(bytes32 indexed consentHash, address indexed revoker, uint64 timestamp);
event IssuerChanged(address indexed oldIssuer, address indexed newIssuer);
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
```

#### Gas Optimization Design

- **Struct packing:** `address` + `uint64` + `bool` fits in one 32-byte storage slot
- **No strings in mappings:** Identifiers stored as `bytes32` (hash of UUID)
- **Events for indexing:** Off-chain indexers use events; on-chain only stores minimal state
- **No array iterations:** All lookups are O(1) mapping reads
- **No upgradability proxy:** Contract is minimal and immutable — use `setIssuer` for key rotation

#### Estimated Gas Costs (Base network)

| Operation | Approx Gas | Approx Cost (0.001 gwei base fee) |
|-----------|-----------|----------------------------------|
| `anchorReferenceHash` | ~43,000 | ~$0.0001 |
| `registerConsentHash` | ~43,000 | ~$0.0001 |
| `revokeConsentHash` | ~21,000 | ~$0.00005 |
| `verifyReferenceAnchor` | ~2,100 | free (view) |
| `verifyConsent` | ~2,100 | free (view) |

---

### 4.2 Integration with Existing Contracts

| Existing Contract | Relationship |
|-------------------|-------------|
| `HRKReferenceProof.sol` | Superseded by `HRKAnchorRegistry` for new references; existing proofs remain valid |
| `PeerProofRegistry.sol` | Provides suppression/revocation lifecycle; `HRKAnchorRegistry` is orthogonal (anchoring only) |
| `HRKToken.sol` | No direct integration at MVP; future: gate verifier requests behind HRK token stake |
| `HRKStaking.sol` | Future: staking tier determines verifier request rate limits |

---

## SECTION 5 — Grant-Ready Milestone Definition

### 5.1 Minimum Viable Milestone for Base Builder Grants

The following checklist defines the minimum shipped state qualifying HRKey for Base Builder Grants. All items marked **REQUIRED** must be demonstrably functional on Base Sepolia (testnet) at minimum, Base Mainnet preferred.

#### Milestone Checklist

| # | Requirement | Status | Evidence |
|---|-------------|--------|---------|
| M1 | **[REQUIRED]** `HRKAnchorRegistry` deployed on Base Sepolia | ⬜ | Contract address + verified Basescan |
| M2 | **[REQUIRED]** At least 3 real reference hashes anchored on-chain | ⬜ | Transaction hashes |
| M3 | **[REQUIRED]** At least 3 consent hashes registered on-chain | ⬜ | Transaction hashes |
| M4 | **[REQUIRED]** At least 1 end-to-end disclosure proof generated and verifiable | ⬜ | Proof object + verification result |
| M5 | **[REQUIRED]** Vault integration: references encrypted at rest in Supabase | ✅ | Existing implementation |
| M6 | **[REQUIRED]** Consent enforcement: no disclosure without valid ConsentObject | ✅ | Existing consentManager |
| M7 | **[REQUIRED]** Verifier API: `POST /api/verifier/request` and `POST /api/verifier/consent` functional | ⬜ | API tests passing |
| M8 | **[REQUIRED]** Merkle selective disclosure: verifier receives only disclosed fields | ⬜ | Disclosure proof test |
| M9 | **[REQUIRED]** Audit trail: all verifier requests and disclosures logged | ✅ | Existing audit_events |
| M10 | **[RECOMMENDED]** `HRKAnchorRegistry` deployed on Base Mainnet | ⬜ | Contract address |
| M11 | **[RECOMMENDED]** Reference suppression/revocation reflected on-chain | ✅ | PeerProofRegistry |
| M12 | **[RECOMMENDED]** UI for candidate consent flow | ⬜ | Demo video |

#### Minimum Reference Count

- **3 references minimum** with distinct subject DIDs
- References must span at least 2 different author companies
- Each reference must have at least 4 field hashes (relationship, duration, recommendation_strength, full_text minimum)

#### Vault Integration Requirements

- Field salts stored encrypted in `sdl_statements` vault (already present)
- Full reference text encrypted AES-256-GCM at rest
- Key management via Supabase Vault or equivalent HSM-backed store
- Vault access logged in `audit_events`

#### Smart Contract Deployment Requirements

- `HRKAnchorRegistry.sol` compiled with Solidity 0.8.24, optimizer 200 runs
- Deployed via existing `hardhat.config.ts` pipeline
- Issuer address set to backend signing wallet
- Contract verified on Basescan (source code public)

#### Consent Enforcement Requirements

- No `DisclosureProofObject` generated without:
  1. A valid `ConsentObject` linked to the `VerifierRequestObject`
  2. `ConsentObject.subject_signature` cryptographically verified
  3. `consent_hash` anchored on-chain and not revoked
  4. `ConsentObject.valid_to` not expired

#### Verifier Interface Requirements

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/verifier/request` | POST | Submit verification request |
| `/api/verifier/request/:id` | GET | Check request status |
| `/api/verifier/consent` | POST | Subject grants consent |
| `/api/verifier/proof/:request_id` | GET | Retrieve disclosure proof (verifier only) |
| `/api/verifier/verify` | POST | Cryptographic verification of proof |

---

## SECTION 6 — Security Analysis

### 6.1 Threat Model

| Actor | Motivation |
|-------|-----------|
| Malicious Recruiter | Access reference content without consent; forge consent |
| Malicious Candidate | Forge reference; suppress legitimate reference |
| Malicious Reviewer | Forge reference content post-signature |
| Compromised Backend | Disclose fields beyond consent scope |
| External Attacker | Replay consent; forge proofs; extract vault data |

---

### 6.2 Risk Register

#### R1 — Consent Forgery

| Attribute | Value |
|-----------|-------|
| **Risk** | Attacker generates a ConsentObject with a forged subject_signature |
| **Impact** | Unauthorized disclosure of reference fields |
| **Likelihood** | Low (requires private key compromise) |
| **Mitigation 1** | `subject_signature = EIP-191(consent_hash, subject_private_key)` — forgery requires key theft |
| **Mitigation 2** | `consent_hash` is anchored on Base — cannot be fabricated post-hoc |
| **Mitigation 3** | `nonce` field prevents pre-computation attacks |
| **Mitigation 4** | Backend verifies signature before generating any proof |
| **Residual Risk** | Subject private key compromise — mitigated by wallet security (user responsibility) |

---

#### R2 — Replay Attacks

| Attribute | Value |
|-----------|-------|
| **Risk** | Attacker replays a valid ConsentObject to obtain disclosure for a different verifier or after revocation |
| **Impact** | Unauthorized disclosure using expired/revoked consent |
| **Likelihood** | Medium (if nonce not enforced) |
| **Mitigation 1** | `ConsentObject.nonce` = 32-byte random; stored in DB; rejected if seen before |
| **Mitigation 2** | `ConsentObject.valid_to` enforced at proof generation time |
| **Mitigation 3** | `HRKAnchorRegistry.verifyConsent()` checked on-chain — revoked consents blocked |
| **Mitigation 4** | `ConsentObject.grantee_did` bound to specific verifier — proof delivery restricted to that DID |
| **Mitigation 5** | `VerifierRequestObject.request_id` linked to ConsentObject — consent cannot be reused for different request |

---

#### R3 — Unauthorized Disclosure

| Attribute | Value |
|-----------|-------|
| **Risk** | Backend generates disclosure proof for fields beyond consent scope |
| **Impact** | Privacy violation; protocol integrity failure |
| **Likelihood** | Low (requires backend compromise or bug) |
| **Mitigation 1** | `disclosed_fields` in DisclosureProofObject MUST be a strict subset of `ConsentObject.disclosed_fields` |
| **Mitigation 2** | Assertion enforced in `selectiveDisclosure.service.js` before proof generation |
| **Mitigation 3** | `DisclosureProofObject.consent_anchor` lets verifier confirm consent scope on-chain |
| **Mitigation 4** | Audit log records every proof generation with consent_id |
| **Mitigation 5** | `undisclosed_field_hashes` proves to verifier which fields were withheld |

---

#### R4 — Vault Compromise

| Attribute | Value |
|-----------|-------|
| **Risk** | Attacker gains read access to Supabase vault, extracting field salts and plaintext references |
| **Impact** | Full reference content exposed; field hash preimages computable |
| **Likelihood** | Low (requires Supabase breach + key compromise) |
| **Mitigation 1** | Field salts stored encrypted with AES-256-GCM using Supabase Vault keys |
| **Mitigation 2** | Encryption keys stored in Supabase Vault (HSM-backed, not in application code) |
| **Mitigation 3** | On-chain hash anchoring independent of vault — if vault compromised, on-chain root still authentic |
| **Mitigation 4** | Row-level security (RLS) in Supabase limits access to service role only |
| **Mitigation 5** | Even with salt exposure, on-chain root_hash proves what was committed at anchor time |

---

#### R5 — Hash Collision Risks

| Attribute | Value |
|-----------|-------|
| **Risk** | Two different field values produce the same field_hash (SHA-256 collision) |
| **Impact** | False authenticity; verifier accepts wrong value |
| **Likelihood** | Negligible (SHA-256 collision resistance: 2^128 operations) |
| **Mitigation 1** | SHA-256 provides 128-bit collision resistance — no practical attack exists |
| **Mitigation 2** | Field salt (32 random bytes) makes preimage attacks computationally infeasible |
| **Mitigation 3** | `ref_id` included in hash input — same field value in different references produces different hash |
| **Future** | Upgrade to SHA-3/Poseidon when ZK phase begins (no protocol change required, just leaf function) |

---

#### R6 — Reference Forgery by Reviewer

| Attribute | Value |
|-----------|-------|
| **Risk** | Reviewer submits false reference content that does not match their signature |
| **Impact** | False positive in employment verification |
| **Likelihood** | Medium (reviewers could lie about content) |
| **Mitigation 1** | Author_signature binds reviewer's wallet to the exact field_hashes at creation time |
| **Mitigation 2** | Reviewer must be a verified company_signer (KYC'd company account) |
| **Mitigation 3** | Reviewer can revoke via `PeerProofRegistry.revoke()` if reference becomes inaccurate |
| **Mitigation 4** | Reference validation service (`referenceValidation.service.js`) checks narrative consistency |
| **Residual Risk** | Social engineering of legitimate reviewer — out of protocol scope |

---

#### R7 — Merkle Path Manipulation

| Attribute | Value |
|-----------|-------|
| **Risk** | Attacker provides fake merkle_path in DisclosureProofObject proving wrong value |
| **Impact** | Verifier accepts false field value as authenticated |
| **Likelihood** | Low (requires knowledge of tree structure + SHA-256 preimage) |
| **Mitigation 1** | Verifier MUST independently verify merkle_path against on-chain root_hash |
| **Mitigation 2** | On-chain root_hash was signed by author at reference creation — immutable |
| **Mitigation 3** | Issuer_signature over proof_hash covers disclosed_fields including merkle_path |
| **Mitigation 4** | Deterministic Merkle construction — impossible to forge valid path for false leaf |

---

### 6.3 Security Invariants (Normative)

The following invariants MUST hold at all times:

```
INV-1: ∀ disclosure proof P: P.disclosed_fields ⊆ P.consent.disclosed_fields
INV-2: ∀ consent C: C.subject_signature verifies over C.consent_hash with C.subject_did key
INV-3: ∀ anchored reference R: R.root_hash is immutable on Base after anchor_tx confirmed
INV-4: ∀ consent C: if C is revoked on-chain, no new proofs SHALL be generated for C
INV-5: ∀ reference R: if R.status = Suppressed, no disclosure proofs SHALL be generated for R
INV-6: ∀ field hash H: H = SHA256(ref_id || ":" || field_name || ":" || value || ":" || salt)
INV-7: ∀ merkle_root: merkle_root = SHA256(canonical_JSON(sorted field_hashes))
```

---

### 6.4 Cryptographic Parameter Summary

| Parameter | Algorithm | Key Size | Standard |
|-----------|-----------|----------|---------|
| Field hash | SHA-256 | 256-bit | NIST FIPS 180-4 |
| Merkle hash | SHA-256 | 256-bit | NIST FIPS 180-4 |
| Author signature | secp256k1 ECDSA | 256-bit | EIP-191 |
| Consent signature | secp256k1 ECDSA | 256-bit | EIP-191 |
| Issuer signature | secp256k1 ECDSA | 256-bit | EIP-191 |
| Vault encryption | AES-256-GCM | 256-bit | NIST SP 800-38D |
| Nonce | CSPRNG | 256-bit | OS entropy |

---

## Appendix A — Canonical JSON Specification

All canonical JSON in this protocol follows RFC 8785 (JCS — JSON Canonicalization Scheme):

1. Keys sorted lexicographically (Unicode code point order)
2. No whitespace (no spaces, no newlines)
3. UTF-8 encoded
4. Numbers serialized without trailing zeros
5. `null` values included explicitly

Example:
```json
{"author_did":"did:ethr:base:0xabc","created_at":"2026-02-20T00:00:00Z","ref_id":"123e4567-e89b-12d3-a456-426614174000","spec_version":"1.0.0"}
```

---

## Appendix B — DID Method

All DIDs use `did:ethr:base:<checksummed_0x_address>` per EIP-55 checksum. Example:

```
did:ethr:base:0xAbCd1234...
```

Resolution: Ethereum address is the identity key. Signing uses the corresponding secp256k1 private key via EIP-191 `personal_sign`.

---

## Appendix C — Field Name Registry

Standard field names for ReferenceObject:

| Field Name | Type | Description |
|-----------|------|-------------|
| `relationship` | string | e.g. "Direct Manager", "Peer", "Skip-level" |
| `duration_months` | number | Integer months of working relationship |
| `skills` | string | JSON array of skill strings |
| `recommendation_strength` | string | "Strong" / "Moderate" / "With Reservations" |
| `full_text` | string | Full reference letter text |
| `performance_rating` | number | 1-10 numeric rating |
| `title_at_time` | string | Candidate's job title during reference period |
| `would_rehire` | boolean | Reviewer would rehire candidate |

---

*End of HRKey Grant-Ready Architecture Specification v1.0.0*
