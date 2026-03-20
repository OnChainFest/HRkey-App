import { createClient } from '@supabase/supabase-js';
import { clampScore, roundTo3 } from './roleFit.service.js';

const BAND_THRESHOLDS = Object.freeze({
  strong: 0.72,
  moderate: 0.45
});

const OVERCLAIMING_PATTERN = /(high potential|top performer|strong hire|recommended hire|must hire|future leader|guaranteed|will succeed|will excel|best candidate)/i;
const TITLE_LEVEL_RULES = Object.freeze([
  { pattern: /\b(intern|trainee|apprentice)\b/i, level: 0, label: 'entry' },
  { pattern: /\b(assistant|coordinator|associate)\b/i, level: 1, label: 'associate' },
  { pattern: /\b(analyst|engineer|developer|designer|consultant|specialist|administrator|scientist)\b/i, level: 2, label: 'individual-contributor' },
  { pattern: /\b(senior|sr)\b/i, level: 3, label: 'senior-ic' },
  { pattern: /\b(staff|principal|architect)\b/i, level: 4, label: 'advanced-ic' },
  { pattern: /\b(lead|team lead|technical lead)\b/i, level: 5, label: 'lead' },
  { pattern: /\b(manager|supervisor)\b/i, level: 6, label: 'manager' },
  { pattern: /\b(senior manager|group manager|general manager)\b/i, level: 7, label: 'senior-manager' },
  { pattern: /\b(director|head)\b/i, level: 8, label: 'director' },
  { pattern: /\b(vp|vice president|svp|avp)\b/i, level: 9, label: 'executive' },
  { pattern: /\b(cxo|chief|president|founder|co-founder)\b/i, level: 10, label: 'executive' }
]);
const LEADERSHIP_PATTERNS = Object.freeze([/\blead\b/i, /\bmanager\b/i, /\bdirector\b/i, /\bhead\b/i, /\bvp\b/i, /\bchief\b/i, /\bowner(ship)?\b/i]);
const OWNERSHIP_PATTERNS = Object.freeze([/\bown(ed|ership)?\b/i, /\bled\b/i, /\bmanaged\b/i, /\bmentored\b/i, /\bpeople manager\b/i, /\bteam of \d+/i]);

let supabaseClient;

export function __setSupabaseClientForTests(client) {
  supabaseClient = client;
}

export function __resetSupabaseClientForTests() {
  supabaseClient = undefined;
}

function getSupabaseClient() {
  const resolvedSupabaseUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
  const resolvedSupabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

  if (supabaseClient) return supabaseClient;
  supabaseClient = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
  return supabaseClient;
}

function roundScore(value) {
  return roundTo3(clampScore(value));
}

function deriveBand(score) {
  if (score >= BAND_THRESHOLDS.strong) return 'strong';
  if (score >= BAND_THRESHOLDS.moderate) return 'moderate';
  return 'limited';
}

function addUnique(target, text) {
  if (text && !target.includes(text)) target.push(text);
}

export function safeDateDiffInMonths(startValue, endValue) {
  if (!startValue || !endValue) return null;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return diffMs / (1000 * 60 * 60 * 24 * 30.4375);
}

export function normalizeTitle(title) {
  const normalized = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9/&+\- ]+/g, ' ')
    .replace(/\biii?\b/g, ' ')
    .replace(/\biv\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let level = null;
  let label = 'unresolved';
  for (const rule of TITLE_LEVEL_RULES) {
    if (rule.pattern.test(normalized)) {
      level = Math.max(level ?? -1, rule.level);
      label = rule.label;
    }
  }

  const leadershipSignal = LEADERSHIP_PATTERNS.some((pattern) => pattern.test(normalized));

  return {
    raw: String(title || '').trim() || null,
    normalized,
    level,
    label,
    leadershipSignal,
    isResolved: Number.isFinite(level)
  };
}

function normalizeRoleRecord(role = {}, index = 0) {
  const title = role.title || role.role || role.position || role.name || role.headline || null;
  const company = role.company || role.company_name || role.employer || role.organization || null;
  const startDate = role.start_date || role.startDate || role.from || null;
  const endDate = role.end_date || role.endDate || role.to || null;
  const seniorityHint = role.seniority || role.level || role.seniority_level || null;
  const normalizedTitle = normalizeTitle(title || seniorityHint || '');

  return {
    id: role.id || `role-${index + 1}`,
    title,
    company,
    startDate,
    endDate,
    seniorityHint,
    titleSignal: normalizedTitle,
    evidenceText: [title, company, seniorityHint].filter(Boolean).join(' ').trim()
  };
}

async function safeFetchTableRows(table, candidateId) {
  try {
    const builder = getSupabaseClient()
      .from(table)
      .select('*');

    const candidateField = table === 'positions' ? 'candidate_id' : 'owner_id';
    const { data, error } = await builder.eq(candidateField, candidateId).order('start_date', { ascending: false });
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function safeFetchReferences(candidateId) {
  try {
    const { data, error } = await getSupabaseClient()
      .from('references')
      .select('id, owner_id, summary, answer_text, answer, relationship, detailed_feedback, created_at, approved_at')
      .eq('owner_id', candidateId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchCandidateTrajectoryEvidence(candidateId) {
  const [rolesRows, positionsRows, references] = await Promise.all([
    safeFetchTableRows('roles', candidateId),
    safeFetchTableRows('positions', candidateId),
    safeFetchReferences(candidateId)
  ]);

  const sourceRows = rolesRows.length ? rolesRows : positionsRows;
  const roles = sourceRows.map(normalizeRoleRecord)
    .filter((role) => role.title || role.company || role.startDate || role.endDate || role.seniorityHint)
    .sort((left, right) => {
      const leftTime = new Date(left.startDate || left.endDate || 0).getTime();
      const rightTime = new Date(right.startDate || right.endDate || 0).getTime();
      return leftTime - rightTime;
    });

  return { roles, references };
}

function buildTransitions(roles = []) {
  const transitions = [];
  for (let index = 1; index < roles.length; index += 1) {
    const previous = roles[index - 1];
    const current = roles[index];
    const levelDelta = Number.isFinite(previous.titleSignal.level) && Number.isFinite(current.titleSignal.level)
      ? current.titleSignal.level - previous.titleSignal.level
      : null;
    const monthsBetween = safeDateDiffInMonths(previous.startDate || previous.endDate, current.startDate || current.endDate);

    transitions.push({
      previous,
      current,
      levelDelta,
      monthsBetween,
      sameCompany: !!previous.company && !!current.company && String(previous.company).toLowerCase() === String(current.company).toLowerCase(),
      upwardMove: Number.isFinite(levelDelta) && levelDelta > 0,
      lateralMove: Number.isFinite(levelDelta) && levelDelta === 0,
      downwardMove: Number.isFinite(levelDelta) && levelDelta < 0,
      titleResolved: previous.titleSignal.isResolved && current.titleSignal.isResolved
    });
  }
  return transitions;
}

export function detectProgression(roles = [], references = []) {
  const transitions = buildTransitions(roles);
  const leadershipReferenceHits = references.filter((reference) => {
    const text = [reference.summary, reference.answer_text, reference.answer, JSON.stringify(reference.detailed_feedback || {})].join(' ');
    return OWNERSHIP_PATTERNS.some((pattern) => pattern.test(text));
  }).length;

  const resolvedTitles = roles.filter((role) => role.titleSignal.isResolved).length;
  const leadershipRoles = roles.filter((role) => role.titleSignal.leadershipSignal).length;

  return {
    transitions,
    resolvedTitles,
    unresolvedTitles: roles.length - resolvedTitles,
    upwardMoves: transitions.filter((item) => item.upwardMove),
    lateralMoves: transitions.filter((item) => item.lateralMove),
    downwardMoves: transitions.filter((item) => item.downwardMove),
    leadershipRoles,
    leadershipReferenceHits
  };
}

function computePromotionVelocitySignal(roles, progression) {
  const explanation = [];
  const caveats = [];

  if (roles.length < 2) {
    addUnique(caveats, 'Promotion velocity needs at least two historical roles to compare role changes over time.');
    return {
      score: roundScore(roles.length === 1 ? 0.22 : 0.12),
      band: 'limited',
      explanation: ['Insufficient role history to measure time between upward role changes.'],
      caveats
    };
  }

  const resolvedTransitions = progression.transitions.filter((item) => item.titleResolved);
  const upwardMoves = progression.upwardMoves;
  const measurableUpwardMoves = upwardMoves.filter((item) => Number.isFinite(item.monthsBetween));
  const averageUpwardMonths = measurableUpwardMoves.length
    ? measurableUpwardMoves.reduce((sum, item) => sum + item.monthsBetween, 0) / measurableUpwardMoves.length
    : null;

  const upwardShare = resolvedTransitions.length ? upwardMoves.length / resolvedTransitions.length : 0;
  const speedScore = averageUpwardMonths == null
    ? 0.28
    : averageUpwardMonths <= 18 ? 0.86 : averageUpwardMonths <= 30 ? 0.66 : averageUpwardMonths <= 48 ? 0.48 : 0.3;
  const score = roundScore((upwardShare * 0.6) + (speedScore * 0.4));

  if (upwardMoves.length) {
    addUnique(explanation, `${upwardMoves.length} upward title change${upwardMoves.length === 1 ? '' : 's'} were identified across ${roles.length} roles.`);
  } else {
    addUnique(explanation, 'No clear upward title changes were identified in the available role history.');
  }

  if (averageUpwardMonths != null) {
    addUnique(explanation, `Average observed time between upward moves was about ${Math.round(averageUpwardMonths)} months.`);
  }

  if (progression.lateralMoves.length) {
    addUnique(caveats, `${progression.lateralMoves.length} role change${progression.lateralMoves.length === 1 ? '' : 's'} looked lateral based on title heuristics and were not treated as promotions.`);
  }
  if (progression.unresolvedTitles > 0 || resolvedTransitions.length === 0) {
    addUnique(caveats, 'Some titles were unclear, so promotion speed was estimated conservatively.');
  }
  if (averageUpwardMonths == null && upwardMoves.length) {
    addUnique(caveats, 'Missing or partial date fields limited time-based promotion comparisons.');
  }

  return { score, band: deriveBand(score), explanation, caveats };
}

function computeRoleComplexitySignal(roles, progression) {
  const explanation = [];
  const caveats = [];

  if (!roles.length) return null;

  const resolvedRoles = roles.filter((role) => role.titleSignal.isResolved);
  if (resolvedRoles.length < 2) {
    addUnique(caveats, 'Role complexity progression is limited because title scope could not be compared across multiple roles.');
    return {
      score: roundScore(roles.length === 1 && roles[0].titleSignal.isResolved ? 0.3 : 0.18),
      band: 'limited',
      explanation: ['Available titles provide only limited evidence about changes in role scope.'],
      caveats
    };
  }

  const first = resolvedRoles[0];
  const last = resolvedRoles[resolvedRoles.length - 1];
  const netDelta = (last.titleSignal.level ?? 0) - (first.titleSignal.level ?? 0);
  const positiveTransitionShare = progression.transitions.filter((item) => item.titleResolved).length
    ? progression.upwardMoves.length / progression.transitions.filter((item) => item.titleResolved).length
    : 0;
  const score = roundScore(clampScore(((netDelta + 2) / 6) * 0.7 + positiveTransitionShare * 0.3));

  addUnique(explanation, `Role titles moved from ${first.title || 'an earlier role'} to ${last.title || 'a later role'} in the available history.`);
  if (netDelta > 0) addUnique(explanation, 'Title heuristics suggest increasing scope over time.');
  else if (netDelta === 0) addUnique(explanation, 'Title heuristics suggest relatively stable scope across the observed roles.');
  else addUnique(explanation, 'Later titles did not show a clear increase in scope compared with earlier roles.');

  if (progression.unresolvedTitles > 0) {
    addUnique(caveats, 'Some titles could not be mapped cleanly to a scope level, so progression was kept conservative.');
  }
  if (progression.downwardMoves.length) {
    addUnique(caveats, 'At least one title change suggested a reduced or different scope, which lowers confidence in a simple upward progression pattern.');
  }

  return { score, band: deriveBand(score), explanation, caveats };
}

function computeLeadershipDevelopmentSignal(roles, progression) {
  const explanation = [];
  const caveats = [];

  if (!roles.length) return null;

  const firstLeadershipIndex = roles.findIndex((role) => role.titleSignal.leadershipSignal);
  const hasLeadershipTitle = firstLeadershipIndex >= 0;
  const leadershipEvidenceScore = clampScore((progression.leadershipRoles / Math.max(1, roles.length)) * 0.75 + (Math.min(progression.leadershipReferenceHits, 3) / 3) * 0.25);
  const score = roundScore(hasLeadershipTitle ? Math.max(0.46, leadershipEvidenceScore + 0.12) : Math.min(0.28, leadershipEvidenceScore || 0.2));

  if (hasLeadershipTitle) {
    addUnique(explanation, `Leadership-oriented titles first appear as ${roles[firstLeadershipIndex].title}.`);
    if (progression.leadershipReferenceHits > 0) {
      addUnique(explanation, `${progression.leadershipReferenceHits} supporting reference signal${progression.leadershipReferenceHits === 1 ? '' : 's'} mention ownership, management, or mentoring language.`);
    }
  } else {
    addUnique(explanation, 'No clear management or team-lead title was identified in the available roles.');
    addUnique(caveats, 'This does not imply weaker capability; it only means leadership development was not directly evidenced in the available history.');
  }

  if (roles.length === 1) {
    addUnique(caveats, 'Only one role was available, so leadership development over time could not be assessed directly.');
  }

  return { score, band: deriveBand(score), explanation, caveats };
}

function buildSummary(candidateId, signals, caveats, roleCount) {
  if (!roleCount) return 'Insufficient role history is available to derive career trajectory signals for this candidate.';

  const strongSignals = Object.entries(signals).filter(([, value]) => value?.band === 'strong').map(([key]) => key);
  const moderateSignals = Object.entries(signals).filter(([, value]) => value?.band === 'moderate').map(([key]) => key);

  const parts = [];
  if (strongSignals.length) parts.push(`The available history shows strong evidence for ${strongSignals.join(', ')}.`);
  if (moderateSignals.length) parts.push(`Moderate evidence is available for ${moderateSignals.join(', ')}.`);
  if (!strongSignals.length && !moderateSignals.length) parts.push('The available history only supports limited trajectory inferences.');
  if (caveats.length) parts.push('These signals should be read with the attached caveats and only as supporting context, not as a recommendation or forecast.');

  const summary = parts.join(' ');
  return OVERCLAIMING_PATTERN.test(summary) ? `Evidence-based trajectory signals were generated for ${candidateId} with conservative caveats.` : summary;
}

export async function computeCareerTrajectory(candidateId) {
  if (!candidateId) {
    const error = new Error('candidateId is required');
    error.status = 400;
    throw error;
  }

  const { roles, references } = await fetchCandidateTrajectoryEvidence(candidateId);
  if (!roles.length) {
    return {
      candidateId: String(candidateId),
      signals: {},
      summary: 'Insufficient role history is available to derive career trajectory signals for this candidate.',
      caveats: ['No structured roles or positions were found for this candidate.']
    };
  }

  const progression = detectProgression(roles, references);
  const signals = {
    promotionVelocity: computePromotionVelocitySignal(roles, progression),
    roleComplexityProgression: computeRoleComplexitySignal(roles, progression),
    leadershipDevelopment: computeLeadershipDevelopmentSignal(roles, progression)
  };

  const caveats = [];
  Object.values(signals).forEach((signal) => {
    (signal?.caveats || []).forEach((item) => addUnique(caveats, item));
  });
  if (progression.unresolvedTitles === roles.length) {
    addUnique(caveats, 'All title interpretation relied on unresolved or noisy labels, so signals should be treated as highly tentative.');
  }

  return {
    candidateId: String(candidateId),
    signals,
    summary: buildSummary(candidateId, signals, caveats, roles.length),
    caveats
  };
}

export default {
  computeCareerTrajectory,
  safeDateDiffInMonths,
  normalizeTitle,
  detectProgression,
  __setSupabaseClientForTests,
  __resetSupabaseClientForTests
};
