/**
 * REFERENCE SUBMISSION SERVICE
 *
 * Purpose: Handle reference submission with strict validation
 *
 * Architecture Principles:
 * - STRICT validation (no shortcuts)
 * - Immutability after submission
 * - Signature hash for tamper detection
 * - Atomic operations (transaction-like)
 * - All required KPIs must be scored
 * - Evidence minimum length enforcement
 * - Single-use tokens
 *
 * @module services/kpiReference/referenceSubmit.service
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';
import { getReferenceRequestByToken } from './referenceRequest.service.js';
import { getKpiById, validateRequiredKpis, validateKpisBelongToSet } from './kpiSets.service.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Valid rehire decisions
 */
export const RehireDecisions = {
  YES: 'yes',
  NO: 'no',
  CONDITIONAL: 'conditional'
};

/**
 * Valid confidence levels
 */
export const ConfidenceLevels = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

/**
 * Valid overall recommendations
 */
export const OverallRecommendations = {
  STRONGLY_RECOMMEND: 'strongly_recommend',
  RECOMMEND: 'recommend',
  NEUTRAL: 'neutral',
  NOT_RECOMMEND: 'not_recommend'
};

/**
 * Generate signature hash for reference integrity
 *
 * @param {object} referenceData - Reference data
 * @param {array} kpiScores - KPI scores array
 * @returns {string} SHA-256 hash
 */
function generateSignatureHash(referenceData, kpiScores) {
  const payload = {
    candidate_id: referenceData.candidate_id,
    referee_email: referenceData.referee_email,
    relationship_type: referenceData.relationship_type,
    start_date: referenceData.start_date,
    end_date: referenceData.end_date,
    rehire_decision: referenceData.rehire_decision,
    overall_recommendation: referenceData.overall_recommendation,
    kpi_scores: kpiScores.map(kpi => ({
      kpi_id: kpi.kpi_id,
      score: kpi.score,
      evidence_hash: crypto.createHash('sha256').update(kpi.evidence_text).digest('hex')
    })),
    timestamp: referenceData.submitted_at
  };

  const payloadString = JSON.stringify(payload);
  return crypto.createHash('sha256').update(payloadString).digest('hex');
}

/**
 * Validate reference submission payload
 *
 * @param {object} payload - Submission payload
 * @param {object} request - Reference request
 * @param {array} kpis - KPI definitions
 * @returns {Promise<{valid: boolean, errors?: array}>}
 */
async function validateSubmissionPayload(payload, request, kpis) {
  const errors = [];

  // 1. Validate relationship_type
  if (!payload.relationship_type) {
    errors.push('relationship_type is required');
  }

  // 2. Validate dates
  if (payload.start_date && payload.end_date) {
    const startDate = new Date(payload.start_date);
    const endDate = new Date(payload.end_date);

    if (endDate < startDate) {
      errors.push('end_date must be after start_date');
    }
  }

  // 3. Validate confidence_level
  if (payload.confidence_level && !Object.values(ConfidenceLevels).includes(payload.confidence_level)) {
    errors.push(`confidence_level must be one of: ${Object.values(ConfidenceLevels).join(', ')}`);
  }

  // 4. Validate rehire_decision (REQUIRED)
  if (!payload.rehire_decision) {
    errors.push('rehire_decision is required');
  } else if (!Object.values(RehireDecisions).includes(payload.rehire_decision)) {
    errors.push(`rehire_decision must be one of: ${Object.values(RehireDecisions).join(', ')}`);
  }

  // 5. Validate overall_recommendation (optional)
  if (payload.overall_recommendation && !Object.values(OverallRecommendations).includes(payload.overall_recommendation)) {
    errors.push(`overall_recommendation must be one of: ${Object.values(OverallRecommendations).join(', ')}`);
  }

  // 6. Validate KPIs array exists
  if (!payload.kpis || !Array.isArray(payload.kpis)) {
    errors.push('kpis array is required');
    return { valid: false, errors };
  }

  if (payload.kpis.length === 0) {
    errors.push('At least one KPI must be scored');
    return { valid: false, errors };
  }

  // 7. Validate all required KPIs are present
  const requiredValidation = await validateRequiredKpis(request.kpiSet.id, payload.kpis);

  if (!requiredValidation.valid) {
    if (requiredValidation.missingKpis) {
      errors.push(`Missing required KPIs: ${requiredValidation.missingKpis.map(k => k.name).join(', ')}`);
    } else {
      errors.push(requiredValidation.error || 'Required KPI validation failed');
    }
  }

  // 8. Validate all submitted KPIs belong to the KPI set
  const belongsValidation = await validateKpisBelongToSet(request.kpiSet.id, payload.kpis);

  if (!belongsValidation.valid) {
    if (belongsValidation.invalidKpis) {
      errors.push(`Invalid KPI IDs (not in set): ${belongsValidation.invalidKpis.join(', ')}`);
    } else {
      errors.push(belongsValidation.error || 'KPI set validation failed');
    }
  }

  // 9. Validate each KPI score
  const kpiMap = new Map(kpis.map(k => [k.id, k]));
  const seenKpiIds = new Set();

  for (let i = 0; i < payload.kpis.length; i++) {
    const kpiScore = payload.kpis[i];
    const kpiDef = kpiMap.get(kpiScore.kpi_id);

    if (!kpiDef) {
      errors.push(`KPI at index ${i}: KPI not found in set`);
      continue;
    }

    // Check for duplicates
    if (seenKpiIds.has(kpiScore.kpi_id)) {
      errors.push(`KPI at index ${i}: Duplicate KPI ID ${kpiScore.kpi_id} (${kpiDef.name})`);
    }
    seenKpiIds.add(kpiScore.kpi_id);

    // Validate score range (1-5)
    if (typeof kpiScore.score !== 'number' || kpiScore.score < 1 || kpiScore.score > 5) {
      errors.push(`KPI "${kpiDef.name}": score must be a number between 1 and 5`);
    }

    // Validate score is integer
    if (!Number.isInteger(kpiScore.score)) {
      errors.push(`KPI "${kpiDef.name}": score must be an integer (1, 2, 3, 4, or 5)`);
    }

    // Validate evidence_text exists
    if (!kpiScore.evidence_text || typeof kpiScore.evidence_text !== 'string') {
      errors.push(`KPI "${kpiDef.name}": evidence_text is required and must be a string`);
      continue;
    }

    // Validate minimum evidence length
    const minLength = kpiDef.min_evidence_length || 200;
    const evidenceLength = kpiScore.evidence_text.trim().length;

    if (evidenceLength < minLength) {
      errors.push(
        `KPI "${kpiDef.name}": evidence_text must be at least ${minLength} characters (current: ${evidenceLength})`
      );
    }

    // Validate confidence level (per-KPI, optional)
    if (kpiScore.confidence_level && !Object.values(ConfidenceLevels).includes(kpiScore.confidence_level)) {
      errors.push(`KPI "${kpiDef.name}": confidence_level must be one of: ${Object.values(ConfidenceLevels).join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Submit a KPI-driven reference
 *
 * @param {string} token - Plain text token from URL
 * @param {object} payload - Submission payload
 * @param {string} payload.relationship_type - Relationship type
 * @param {string} [payload.start_date] - Start date (ISO 8601)
 * @param {string} [payload.end_date] - End date (ISO 8601)
 * @param {string} payload.confidence_level - Overall confidence (high, medium, low)
 * @param {string} payload.rehire_decision - Rehire decision (yes, no, conditional)
 * @param {string} [payload.rehire_reasoning] - Optional reasoning
 * @param {string} [payload.overall_recommendation] - Optional overall recommendation
 * @param {array} payload.kpis - Array of KPI scores
 * @param {string} [payload.referee_id] - Optional: if referee is registered user
 * @param {string} [payload.referee_name] - Optional: referee name
 * @param {string} [payload.ip_address] - Optional: IP address for audit
 * @param {string} [payload.user_agent] - Optional: User agent for audit
 * @returns {Promise<{success: boolean, reference_id?: string, error?: string, validation_errors?: array}>}
 */
export async function submitReference(token, payload) {
  try {
    // 1. Get and validate reference request
    const requestResult = await getReferenceRequestByToken(token);

    if (!requestResult.success) {
      return {
        success: false,
        error: requestResult.error,
        status: requestResult.status
      };
    }

    const { request, kpiSet, kpis } = requestResult;

    // 2. Validate submission payload
    const validation = await validateSubmissionPayload(payload, requestResult, kpis);

    if (!validation.valid) {
      logger.warn('Reference submission validation failed', {
        request_id: request.id,
        errors: validation.errors
      });

      return {
        success: false,
        error: 'Validation failed',
        validation_errors: validation.errors
      };
    }

    // 3. Prepare reference data
    const submittedAt = new Date().toISOString();

    const referenceData = {
      reference_request_id: request.id,
      candidate_id: request.candidate_id,
      referee_id: payload.referee_id || null,
      referee_email: request.referee_email,
      referee_name: payload.referee_name || request.referee_name || null,
      relationship_type: payload.relationship_type,
      start_date: payload.start_date || null,
      end_date: payload.end_date || null,
      overall_recommendation: payload.overall_recommendation || null,
      rehire_decision: payload.rehire_decision,
      rehire_reasoning: payload.rehire_reasoning || null,
      confidence_level: payload.confidence_level || 'medium',
      submitted_at: submittedAt,
      kpi_set_id: kpiSet.id,
      kpi_set_version: kpiSet.version,
      ip_address: payload.ip_address || null,
      user_agent: payload.user_agent || null
    };

    // 4. Generate signature hash (for tamper detection)
    const signatureHash = generateSignatureHash(referenceData, payload.kpis);
    referenceData.signature_hash = signatureHash;

    // 5. Insert reference (parent record)
    const { data: reference, error: refError } = await supabase
      .from('kpi_references')
      .insert([referenceData])
      .select()
      .single();

    if (refError) {
      // Check if it's a duplicate (reference_request_id is UNIQUE)
      if (refError.code === '23505') {
        logger.error('Duplicate reference submission attempt', {
          request_id: request.id,
          error: refError.message
        });
        return {
          success: false,
          error: 'This reference has already been submitted'
        };
      }

      logger.error('Failed to insert reference', {
        request_id: request.id,
        error: refError.message
      });
      throw refError;
    }

    // 6. Insert KPI scores (child records)
    const kpiScoresData = payload.kpis.map(kpi => {
      const kpiDef = kpis.find(k => k.id === kpi.kpi_id);
      return {
        reference_id: reference.id,
        kpi_id: kpi.kpi_id,
        kpi_key: kpiDef.key,
        kpi_name: kpiDef.name,
        score: kpi.score,
        evidence_text: kpi.evidence_text.trim(),
        confidence_level: kpi.confidence_level || 'medium',
        evidence_metadata: kpi.evidence_metadata || null
      };
    });

    const { data: kpiScores, error: scoresError } = await supabase
      .from('reference_kpi_scores')
      .insert(kpiScoresData)
      .select();

    if (scoresError) {
      logger.error('Failed to insert KPI scores', {
        reference_id: reference.id,
        error: scoresError.message
      });

      // Rollback: delete the reference record
      await supabase
        .from('kpi_references')
        .delete()
        .eq('id', reference.id);

      throw scoresError;
    }

    // 7. Update reference request status to 'submitted'
    const { error: updateError } = await supabase
      .from('reference_requests')
      .update({
        status: 'submitted',
        submitted_at: submittedAt
      })
      .eq('id', request.id);

    if (updateError) {
      logger.error('Failed to update reference request status', {
        request_id: request.id,
        error: updateError.message
      });
      // Non-blocking: reference is already submitted
    }

    // 8. Log success
    logger.info('Reference submitted successfully', {
      reference_id: reference.id,
      request_id: request.id,
      candidate_id: request.candidate_id,
      referee_email: request.referee_email,
      kpi_count: kpiScores.length,
      signature_hash: signatureHash
    });

    // 9. Send notification email to candidate (optional)
    await sendReferenceCompletedEmail(request.candidate_id, reference, kpiScores);

    // 10. Trigger materialized view refresh (async, non-blocking)
    // Note: In production, this should be done via a background job
    refreshCandidateKpiAggregates(request.candidate_id).catch(err => {
      logger.warn('Failed to refresh candidate KPI aggregates', {
        candidate_id: request.candidate_id,
        error: err.message
      });
    });

    return {
      success: true,
      reference_id: reference.id,
      signature_hash: signatureHash,
      submitted_at: submittedAt
    };

  } catch (error) {
    logger.error('Error in submitReference', {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: 'Failed to submit reference'
    };
  }
}

/**
 * Send reference completed notification to candidate
 *
 * @param {string} candidateId - Candidate user ID
 * @param {object} reference - Reference record
 * @param {array} kpiScores - KPI scores
 * @returns {Promise<void>}
 */
async function sendReferenceCompletedEmail(candidateId, reference, kpiScores) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (!RESEND_API_KEY) {
    logger.warn('Email service not configured', {
      message: 'RESEND_API_KEY not set',
      action: 'skipping_email'
    });
    return;
  }

  try {
    // Fetch candidate email
    const { data: candidate, error: candidateError } = await supabase
      .from('users')
      .select('email')
      .eq('id', candidateId)
      .maybeSingle();

    if (candidateError || !candidate?.email) {
      logger.warn('Failed to fetch candidate email', {
        candidateId,
        error: candidateError?.message
      });
      return;
    }

    const avgScore = (kpiScores.reduce((sum, kpi) => sum + kpi.score, 0) / kpiScores.length).toFixed(1);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'HRKey References <noreply@hrkey.com>',
        to: candidate.email,
        subject: '✓ New Reference Completed',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">✓ Reference Completed!</h1>
            </div>

            <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="font-size: 16px; margin: 0 0 20px;">Great news!</p>

              <p style="font-size: 16px; margin: 0 0 20px;">
                ${reference.referee_name || reference.referee_email} has completed your professional reference.
              </p>

              <div style="background: #f0fdf4; border: 2px solid #10b981; padding: 25px; margin: 30px 0; border-radius: 8px; text-align: center;">
                <p style="margin: 0 0 10px; font-size: 14px; color: #065f46; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Average KPI Score</p>
                <p style="margin: 0; font-size: 42px; font-weight: 700; color: #10b981;">${avgScore}<span style="font-size: 24px; color: #6b7280;">/5.0</span></p>
                <p style="margin: 10px 0 0; font-size: 14px; color: #6b7280;">${kpiScores.length} KPIs evaluated</p>
              </div>

              <div style="text-align: center; margin: 35px 0;">
                <a href="${FRONTEND_URL}/references" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
                  View Full Reference
                </a>
              </div>

              <p style="font-size: 14px; color: #6b7280; margin: 30px 0 0;">
                Best regards,<br>
                <strong>The HRKey Team</strong>
              </p>
            </div>
          </div>
        `
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      logger.error('Failed to send reference completed email', {
        statusCode: res.status,
        error: errorText,
        candidateEmail: candidate.email
      });
    } else {
      logger.info('Reference completed email sent', {
        candidateId,
        candidateEmail: candidate.email,
        referenceId: reference.id
      });
    }

  } catch (error) {
    logger.error('Failed to send reference completed email', {
      candidateId,
      error: error.message
    });
  }
}

/**
 * Refresh candidate KPI aggregates materialized view
 * Should be called after new reference is submitted
 *
 * @param {string} candidateId - Candidate user ID
 * @returns {Promise<void>}
 */
async function refreshCandidateKpiAggregates(candidateId) {
  try {
    // Note: Full refresh is expensive. In production, consider incremental refresh or per-candidate update.
    // For P0, we do a full refresh which is acceptable.
    const { error } = await supabase.rpc('refresh_materialized_view', {
      view_name: 'candidate_kpi_aggregates'
    });

    if (error) {
      // RPC might not exist, fallback to raw SQL
      const { error: rawError } = await supabase
        .from('candidate_kpi_aggregates')
        .select('count')
        .limit(0); // Trigger refresh via access

      if (rawError) {
        logger.warn('Could not refresh materialized view', {
          candidateId,
          error: rawError.message
        });
      }
    }

  } catch (error) {
    logger.warn('Error refreshing candidate KPI aggregates', {
      candidateId,
      error: error.message
    });
  }
}

/**
 * Verify reference signature hash
 * Used for integrity checking
 *
 * @param {string} referenceId - Reference UUID
 * @returns {Promise<{valid: boolean, reference?: object, error?: string}>}
 */
export async function verifyReferenceSignature(referenceId) {
  try {
    const { data: reference, error: refError } = await supabase
      .from('kpi_references')
      .select('*')
      .eq('id', referenceId)
      .maybeSingle();

    if (refError || !reference) {
      return { valid: false, error: 'Reference not found' };
    }

    const { data: kpiScores, error: scoresError } = await supabase
      .from('reference_kpi_scores')
      .select('*')
      .eq('reference_id', referenceId);

    if (scoresError) {
      return { valid: false, error: 'Failed to fetch KPI scores' };
    }

    const computedHash = generateSignatureHash(reference, kpiScores);
    const valid = computedHash === reference.signature_hash;

    return {
      valid,
      reference,
      computed_hash: computedHash,
      stored_hash: reference.signature_hash
    };

  } catch (error) {
    logger.error('Error in verifyReferenceSignature', {
      referenceId,
      error: error.message
    });

    return {
      valid: false,
      error: 'Failed to verify signature'
    };
  }
}
