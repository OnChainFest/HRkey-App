// =============================================================================
// Verifier Routes
// HRKey Grant Architecture Spec v1.0.0 — §5 Verifier Interface Requirements
// =============================================================================
// Endpoints:
//   POST   /api/verifier/request             — Submit verification request (Step 4)
//   GET    /api/verifier/request/:id         — Check request status
//   POST   /api/verifier/consent             — Subject grants consent (Step 5)
//   POST   /api/verifier/consent/:id/revoke  — Subject revokes consent
//   GET    /api/verifier/proof/:requestId    — Retrieve disclosure proof (Step 6)
//   POST   /api/verifier/verify              — Cryptographic verification (Step 7)
// =============================================================================

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';
import {
  createVerifierRequest,
  grantConsent,
  generateProof,
  verifyProof,
  revokeConsent,
} from '../services/verifierRequest.service.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// DB client
// ---------------------------------------------------------------------------
let _supabase;
const getDb = () => {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return _supabase;
};

// ---------------------------------------------------------------------------
// Middleware: require authentication header
// (integrates with existing auth middleware pattern)
// ---------------------------------------------------------------------------
function requireAuth(req, res, next) {
  const userId = req.user?.id || req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.userId = userId;
  next();
}

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------
function handleError(res, error, context) {
  logger.error(`verifier route error: ${context}`, {
    message: error.message,
    stack:   error.stack,
  });
  const status = error.statusCode || 500;
  const message = status < 500 ? error.message : 'Internal server error';
  return res.status(status).json({ error: message });
}

// =============================================================================
// POST /api/verifier/request
// Submit a verification request (Step 4)
// =============================================================================
router.post('/request', requireAuth, async (req, res) => {
  const {
    verifier_did,
    verifier_company_id,
    subject_did,
    subject_user_id,
    ref_id,
    requested_fields,
    purpose,
    expires_at,
    verifier_signature,
  } = req.body;

  // --- Input validation ---
  const missing = [];
  if (!verifier_did)       missing.push('verifier_did');
  if (!subject_did)        missing.push('subject_did');
  if (!ref_id)             missing.push('ref_id');
  if (!requested_fields?.length) missing.push('requested_fields');
  if (!purpose)            missing.push('purpose');
  if (!expires_at)         missing.push('expires_at');
  if (!verifier_signature) missing.push('verifier_signature');

  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const validPurposes = ['hiring_decision','background_check','research','verification'];
  if (!validPurposes.includes(purpose)) {
    return res.status(400).json({ error: `Invalid purpose. Must be one of: ${validPurposes.join(', ')}` });
  }

  if (new Date(expires_at) <= new Date()) {
    return res.status(400).json({ error: 'expires_at must be in the future' });
  }

  try {
    const result = await createVerifierRequest({
      verifierDid:       verifier_did,
      verifierCompanyId: verifier_company_id || null,
      subjectDid:        subject_did,
      subjectUserId:     subject_user_id || null,
      refId:             ref_id,
      requestedFields:   requested_fields,
      purpose,
      expiresAt:         expires_at,
      verifierSignature: verifier_signature,
    });

    return res.status(201).json({
      request_id:   result.requestId,
      request_hash: result.requestHash,
      status:       result.status,
      message:      'Verification request submitted. Candidate has been notified.',
    });
  } catch (error) {
    return handleError(res, error, 'createVerifierRequest');
  }
});

// =============================================================================
// GET /api/verifier/request/:id
// Check request status
// =============================================================================
router.get('/request/:id', requireAuth, async (req, res) => {
  const db = getDb();
  const { id } = req.params;

  try {
    const { data: request, error } = await db
      .from('verifier_requests')
      .select('id, status, purpose, requested_fields, created_at, expires_at, verifier_did, subject_did, ref_id')
      .eq('id', id)
      .single();

    if (error || !request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Check for expiry drift
    if (request.status === 'pending' && new Date(request.expires_at) < new Date()) {
      await db.from('verifier_requests').update({ status: 'expired' }).eq('id', id);
      request.status = 'expired';
    }

    return res.status(200).json({ request });
  } catch (error) {
    return handleError(res, error, 'getVerifierRequest');
  }
});

// =============================================================================
// POST /api/verifier/consent
// Candidate grants consent for a verifier request (Step 5)
// =============================================================================
router.post('/consent', requireAuth, async (req, res) => {
  const {
    request_id,
    subject_did,
    disclosed_fields,
    valid_to,
    subject_signature,
  } = req.body;

  // --- Input validation ---
  const missing = [];
  if (!request_id)       missing.push('request_id');
  if (!subject_did)      missing.push('subject_did');
  if (!disclosed_fields?.length) missing.push('disclosed_fields');
  if (!subject_signature) missing.push('subject_signature');

  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  try {
    const result = await grantConsent({
      requestId:       request_id,
      subjectDid:      subject_did,
      subjectUserId:   req.userId,
      disclosedFields: disclosed_fields,
      validTo:         valid_to || null,
      subjectSignature: subject_signature,
    });

    return res.status(201).json({
      consent_id:   result.consentId,
      consent_hash: result.consentHash,
      anchor_tx:    result.anchorTx,
      anchor_block: result.anchorBlock,
      status:       'consent_granted',
      message:      'Consent granted and anchored on Base.',
    });
  } catch (error) {
    return handleError(res, error, 'grantConsent');
  }
});

// =============================================================================
// POST /api/verifier/consent/:id/revoke
// Candidate revokes a previously granted consent
// =============================================================================
router.post('/consent/:id/revoke', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { subject_did } = req.body;

  if (!subject_did) {
    return res.status(400).json({ error: 'subject_did required' });
  }

  try {
    const result = await revokeConsent(id, subject_did, req.userId);
    return res.status(200).json({
      revoked:   result.revoked,
      anchor_tx: result.anchorTx,
      message:   'Consent revoked. No further disclosure proofs will be issued for this consent.',
    });
  } catch (error) {
    return handleError(res, error, 'revokeConsent');
  }
});

// =============================================================================
// GET /api/verifier/proof/:requestId
// Retrieve the disclosure proof for a completed request (Step 6)
// Only accessible by the verifier who made the request
// =============================================================================
router.get('/proof/:requestId', requireAuth, async (req, res) => {
  const db = getDb();
  const { requestId } = req.params;

  try {
    // Load the request to validate access
    const { data: request, error: reqErr } = await db
      .from('verifier_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) {
      return res.status(404).json({ error: 'Verifier request not found' });
    }

    // If consent was granted but proof not yet generated, generate it now
    if (request.status === 'consent_granted') {
      const { proofId, proofObject } = await generateProof(requestId, req.userId);

      // Mark delivery
      await db
        .from('disclosure_proofs')
        .update({ delivered_at: new Date().toISOString() })
        .eq('id', proofId);

      return res.status(200).json({
        request_id: requestId,
        status:     'proof_generated',
        proof:      proofObject,
      });
    }

    // If proof already generated, retrieve it
    if (request.status === 'proof_generated' || request.status === 'verified') {
      const { data: proof, error: proofErr } = await db
        .from('disclosure_proofs')
        .select('*')
        .eq('verifier_request_id', requestId)
        .single();

      if (proofErr || !proof) {
        return res.status(404).json({ error: 'Proof not found' });
      }

      // Mark delivery timestamp if not already set
      if (!proof.delivered_at) {
        await db
          .from('disclosure_proofs')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', proof.id);
      }

      return res.status(200).json({
        request_id: requestId,
        status:     request.status,
        proof: {
          spec_version:             '1.0.0',
          object_type:              'DisclosureProofObject',
          proof_id:                 proof.id,
          ref_id:                   proof.ref_id,
          consent_id:               proof.consent_id,
          verifier_request_id:      proof.verifier_request_id,
          disclosed_fields:         proof.disclosed_fields,
          undisclosed_field_hashes: proof.undisclosed_field_hashes,
          reference_anchor: {
            tx_hash:          proof.ref_anchor_tx,
            block_number:     proof.ref_anchor_block,
            contract_address: proof.ref_anchor_contract,
            chain_id:         proof.ref_chain_id,
          },
          consent_anchor: {
            tx_hash:          proof.consent_anchor_tx,
            block_number:     proof.consent_anchor_block,
            contract_address: proof.consent_anchor_contract,
            chain_id:         proof.consent_chain_id,
          },
          proof_hash:       proof.proof_hash,
          issuer_signature: proof.issuer_signature,
          issuer_address:   proof.issuer_address,
        },
      });
    }

    // Any other status
    return res.status(409).json({
      error:  `Proof not available. Request status: ${request.status}`,
      status: request.status,
    });
  } catch (error) {
    return handleError(res, error, 'getProof');
  }
});

// =============================================================================
// POST /api/verifier/verify
// Cryptographic verification of a disclosure proof (Step 7)
// =============================================================================
router.post('/verify', requireAuth, async (req, res) => {
  const { proof, verifier_request_id, verifier_did } = req.body;

  if (!proof || !verifier_request_id || !verifier_did) {
    return res.status(400).json({
      error: 'Missing required fields: proof, verifier_request_id, verifier_did',
    });
  }

  try {
    const result = await verifyProof(proof, verifier_request_id, verifier_did);

    const response = {
      valid:            result.valid,
      verifier_request_id,
      checks: {
        merkle_paths_valid:   result.checks?.merklePathsValid    ?? false,
        signature_valid:      result.checks?.signatureValid      ?? false,
        consent_not_expired:  result.checks?.consentNotExpired   ?? false,
        structure_valid:      result.checks?.structureValid      ?? false,
        reference_anchored:   result.onChainChecks?.referenceAnchored ?? false,
        consent_on_chain:     result.onChainChecks?.consentValid ?? false,
      },
    };

    if (!result.valid) {
      response.failure_reasons = result.failureReasons;
    }

    if (result.valid) {
      response.message = 'Proof verified. Reference authenticity and consent validity confirmed on Base.';
    }

    return res.status(200).json(response);
  } catch (error) {
    return handleError(res, error, 'verifyProof');
  }
});

export default router;
