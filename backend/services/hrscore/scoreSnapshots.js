/**
 * HRScore Snapshot Service
 *
 * Provides functions to query HRScore snapshot history.
 *
 * @module services/hrscore/scoreSnapshots
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Get HRScore snapshots for a user.
 *
 * @param {Object} params - Query parameters
 * @param {string} params.userId - User ID
 * @param {number} [params.limit=10] - Max number of records
 * @returns {Promise<Array>} Array of snapshot records (newest first)
 */
export async function getScoreSnapshots({ userId, limit = 10 }) {
  try {
    logger.debug('Fetching HRScore snapshots', { userId, limit });

    const { data, error } = await supabase
      .from('hrscore_snapshots')
      .select('id, user_id, score, breakdown, trigger_source, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching HRScore snapshots', {
        userId,
        error: error.message
      });
      return [];
    }

    return data || [];
  } catch (err) {
    logger.error('Unexpected error in getScoreSnapshots', {
      userId,
      error: err.message
    });
    return [];
  }
}

export default {
  getScoreSnapshots
};
