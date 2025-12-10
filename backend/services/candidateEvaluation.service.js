/**
 * Candidate Evaluation Service
 * Loads references from the database and executes the scoring pipeline.
 */

import { createClient } from '@supabase/supabase-js';
import { evaluateCandidateFromReferences } from './scoringPipeline.service.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Convert reference rows from the database into ReferenceAnswerInput objects.
 * @param {Array<object>} rows
 * @returns {Array<{ questionId: string, answerText: string }>}
 */
function mapReferenceRowsToAnswers(rows = []) {
  return rows.map((row, index) => {
    const questionId = String(row.question_id || row.questionId || row.id || `q_${index}`);
    const parts = [];

    if (typeof row.answer_text === 'string') parts.push(row.answer_text);
    if (typeof row.answer === 'string') parts.push(row.answer);
    if (typeof row.summary === 'string') parts.push(row.summary);

    if (row.detailed_feedback && typeof row.detailed_feedback === 'object') {
      Object.values(row.detailed_feedback).forEach((value) => {
        if (typeof value === 'string' && value.trim()) parts.push(value);
      });
    }

    const answerText = parts.join(' ').replace(/\s+/g, ' ').trim();

    return {
      questionId,
      answerText
    };
  });
}

/**
 * @typedef {Object} CandidateEvaluationOptions
 * @property {boolean} [includeRawReferences]
 */

/**
 * @typedef {Object} CandidateEvaluationFromDbResult
 * @property {string} userId
 * @property {import('./scoringPipeline.service.js').CandidateEvaluationResult} scoring
 * @property {Array<object>} [rawReferences]
 */

/**
 * Evaluate a candidate's references and return a scoring bundle.
 * @param {string} userId
 * @param {CandidateEvaluationOptions} [options]
 * @returns {Promise<CandidateEvaluationFromDbResult>}
 */
export async function evaluateCandidateForUser(userId, options = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const includeRawReferences = options.includeRawReferences === true;

  const { data: referenceRows = [], error } = await supabaseClient
    .from('references')
    .select('*')
    .eq('owner_id', userId);

  if (error) {
    throw error;
  }

  const answers = mapReferenceRowsToAnswers(referenceRows);
  const scoring = evaluateCandidateFromReferences(answers);

  return {
    userId,
    scoring,
    rawReferences: includeRawReferences ? referenceRows : undefined
  };
}

export default {
  evaluateCandidateForUser
};
