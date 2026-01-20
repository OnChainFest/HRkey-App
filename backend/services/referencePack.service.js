import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';
import { resolveCandidateId } from './references.service.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be configured for reference pack service');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export function canonicalizeString(value) {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/\s+/g, ' ');
}

export function stableSort(items, compare) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const order = compare(a.item, b.item);
      if (order !== 0) return order;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

function canonicalizeTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function hashValue(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
}

function normalizeKpiRatings(ratings) {
  if (!ratings || typeof ratings !== 'object') return [];
  const entries = Array.isArray(ratings)
    ? ratings
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          kpi_id: canonicalizeString(entry.kpi_id || entry.kpi_name),
          rating: entry.rating_value ?? entry.rating
        }))
    : Object.entries(ratings).map(([kpiId, rating]) => ({
        kpi_id: canonicalizeString(kpiId),
        rating
      }));

  const normalized = entries
    .filter((entry) => entry.kpi_id)
    .map((entry) => ({
      kpi_id: entry.kpi_id,
      rating: entry.rating === null || entry.rating === undefined ? null : Number(entry.rating)
    }));

  return stableSort(normalized, (a, b) => a.kpi_id.localeCompare(b.kpi_id));
}

function buildKpiCoverage(references) {
  const coverageMap = new Map();

  references.forEach((reference) => {
    (reference.kpi_ratings || []).forEach((rating) => {
      if (!rating.kpi_id) return;
      const current = coverageMap.get(rating.kpi_id) || { total: 0, count: 0 };
      const ratingValue = rating.rating === null || rating.rating === undefined ? null : Number(rating.rating);
      if (ratingValue !== null && !Number.isNaN(ratingValue)) {
        current.total += ratingValue;
        current.count += 1;
      }
      coverageMap.set(rating.kpi_id, current);
    });
  });

  const coverage = Array.from(coverageMap.entries()).map(([kpi_id, stats]) => ({
    kpi_id,
    reference_count: stats.count,
    average_rating: stats.count > 0 ? Number((stats.total / stats.count).toFixed(4)) : null
  }));

  return stableSort(coverage, (a, b) => a.kpi_id.localeCompare(b.kpi_id));
}

function buildSummary(references, kpiCoverage) {
  const ratings = references
    .map((ref) => (ref.overall_rating === null || ref.overall_rating === undefined ? null : Number(ref.overall_rating)))
    .filter((value) => value !== null && !Number.isNaN(value));

  const total = ratings.reduce((sum, value) => sum + value, 0);
  const average = ratings.length ? Number((total / ratings.length).toFixed(4)) : null;

  const approvedTimestamps = references
    .map((ref) => ref.approved_at)
    .filter(Boolean)
    .sort();

  return {
    reference_count: references.length,
    average_overall_rating: average,
    kpi_coverage_count: kpiCoverage.length,
    first_approved_at: approvedTimestamps[0] || null,
    last_approved_at: approvedTimestamps[approvedTimestamps.length - 1] || null
  };
}

export async function buildCanonicalReferencePack(candidateIdOrWallet) {
  const identifier = canonicalizeString(candidateIdOrWallet);
  if (!identifier) {
    const error = new Error('Candidate identifier is required');
    error.status = 400;
    throw error;
  }

  let candidateId = null;
  let candidateWallet = null;

  if (isUuid(identifier)) {
    candidateId = identifier;
  } else {
    candidateWallet = identifier;
    candidateId = await resolveCandidateId({ candidateWallet: identifier });
  }

  if (!candidateId && !candidateWallet) {
    const error = new Error('Candidate not found');
    error.status = 404;
    throw error;
  }

  const { data: referenceRows = [], error: referenceError } = await supabase
    .from('references')
    .select(
      'id, owner_id, referrer_name, referrer_email, referrer_company, relationship, summary, overall_rating, kpi_ratings, status, approved_at, created_at, role_id'
    )
    .eq('owner_id', candidateId)
    .eq('status', 'approved');

  if (referenceError) {
    logger.error('Failed to fetch approved references for reference pack', {
      candidateId,
      error: referenceError.message
    });
    throw referenceError;
  }

  const approvedReferences = (referenceRows || [])
    .filter((ref) => canonicalizeString(ref.status) === 'approved')
    .map((ref) => {
      const refereeSource = canonicalizeString(ref.referrer_email || ref.referrer_name || ref.id);
      const companySource = canonicalizeString(ref.referrer_company);

      return {
        reference_id: canonicalizeString(ref.id),
        approved_at: canonicalizeTimestamp(ref.approved_at || ref.created_at),
        referee_id_hash: hashValue(refereeSource),
        company_hash: hashValue(companySource),
        relationship: canonicalizeString(ref.relationship),
        role_id: canonicalizeString(ref.role_id),
        overall_rating: ref.overall_rating === null || ref.overall_rating === undefined ? null : Number(ref.overall_rating),
        kpi_ratings: normalizeKpiRatings(ref.kpi_ratings),
        summary: canonicalizeString(ref.summary)
      };
    });

  const sortedReferences = stableSort(approvedReferences, (a, b) => {
    const timeCompare = String(a.approved_at || '').localeCompare(String(b.approved_at || ''));
    if (timeCompare !== 0) return timeCompare;
    return String(a.reference_id || '').localeCompare(String(b.reference_id || ''));
  });

  let kpiObservationsQuery = supabase
    .from('kpi_observations')
    .select(
      'id, kpi_id, kpi_name, rating_value, outcome_value, observed_at, observation_period, source, reference_id, verified'
    );

  if (candidateId) {
    kpiObservationsQuery = kpiObservationsQuery.eq('subject_user_id', candidateId);
  } else if (candidateWallet) {
    kpiObservationsQuery = kpiObservationsQuery.eq('subject_wallet', candidateWallet);
  }

  const { data: observationRows = [], error: observationError } = await kpiObservationsQuery;

  if (observationError) {
    logger.error('Failed to fetch KPI observations for reference pack', {
      candidateId,
      candidateWallet,
      error: observationError.message
    });
    throw observationError;
  }

  const kpiObservations = (observationRows || [])
    .map((obs) => {
      const kpiId = canonicalizeString(obs.kpi_id || obs.kpi_name);
      if (!kpiId) return null;
      return {
        observation_id: canonicalizeString(obs.id),
        kpi_id: kpiId,
        kpi_name: canonicalizeString(obs.kpi_name),
        rating_value: obs.rating_value === null || obs.rating_value === undefined ? null : Number(obs.rating_value),
        outcome_value: obs.outcome_value === null || obs.outcome_value === undefined ? null : Number(obs.outcome_value),
        observed_at: canonicalizeTimestamp(obs.observed_at),
        observation_period: canonicalizeString(obs.observation_period),
        source: canonicalizeString(obs.source),
        reference_id: canonicalizeString(obs.reference_id),
        verified: Boolean(obs.verified)
      };
    })
    .filter(Boolean);

  const sortedObservations = stableSort(kpiObservations, (a, b) => a.kpi_id.localeCompare(b.kpi_id));
  const kpiCoverage = buildKpiCoverage(sortedReferences);
  const summary = buildSummary(sortedReferences, kpiCoverage);

  return {
    schema: 'hrkey.reference_pack.v1',
    candidate_id: candidateId,
    candidate_wallet: candidateWallet,
    references: sortedReferences,
    kpi_observations: sortedObservations,
    kpi_coverage: kpiCoverage,
    summary
  };
}
