/**
 * KPI SETS SERVICE
 *
 * Purpose: Manage versioned KPI definitions by role + seniority
 *
 * Architecture Principles:
 * - KPI sets are versioned (copy-on-write)
 * - Only ONE active version per role+seniority
 * - KPIs are immutable after references link to them
 * - All KPI definitions are public (readable by anyone)
 *
 * @module services/kpiReference/kpiSets.service
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrervcydgdrlcndtjboy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Valid seniority levels enum
 */
export const SeniorityLevels = {
  JUNIOR: 'junior',
  MID: 'mid',
  SENIOR: 'senior',
  LEAD: 'lead',
  PRINCIPAL: 'principal'
};

/**
 * Get active KPI set for a given role and seniority level
 *
 * @param {string} role - Role identifier (e.g., 'backend_engineer')
 * @param {string} seniorityLevel - Seniority level (junior, mid, senior, lead, principal)
 * @returns {Promise<{success: boolean, kpiSet?: object, kpis?: array, error?: string}>}
 *
 * @example
 * const result = await getActiveKpiSet('backend_engineer', 'senior');
 * // Returns: { success: true, kpiSet: {...}, kpis: [{...}, {...}] }
 */
export async function getActiveKpiSet(role, seniorityLevel) {
  try {
    // Validate inputs
    if (!role || typeof role !== 'string') {
      return { success: false, error: 'Role is required and must be a string' };
    }

    if (!Object.values(SeniorityLevels).includes(seniorityLevel)) {
      return {
        success: false,
        error: `Invalid seniority level. Must be one of: ${Object.values(SeniorityLevels).join(', ')}`
      };
    }

    // Fetch active KPI set
    const { data: kpiSet, error: setError } = await supabase
      .from('kpi_sets')
      .select('*')
      .eq('role', role)
      .eq('seniority_level', seniorityLevel)
      .eq('active', true)
      .maybeSingle();

    if (setError) {
      logger.error('Failed to fetch active KPI set', {
        role,
        seniorityLevel,
        error: setError.message
      });
      throw setError;
    }

    if (!kpiSet) {
      return {
        success: false,
        error: `No active KPI set found for role "${role}" at seniority level "${seniorityLevel}"`
      };
    }

    // Fetch KPIs for this set
    const { data: kpis, error: kpisError } = await supabase
      .from('kpis')
      .select('*')
      .eq('kpi_set_id', kpiSet.id)
      .order('key', { ascending: true });

    if (kpisError) {
      logger.error('Failed to fetch KPIs for set', {
        kpiSetId: kpiSet.id,
        error: kpisError.message
      });
      throw kpisError;
    }

    logger.debug('Active KPI set retrieved', {
      role,
      seniorityLevel,
      version: kpiSet.version,
      kpiCount: kpis.length
    });

    return {
      success: true,
      kpiSet: {
        id: kpiSet.id,
        role: kpiSet.role,
        seniority_level: kpiSet.seniority_level,
        version: kpiSet.version,
        description: kpiSet.description,
        created_at: kpiSet.created_at
      },
      kpis: kpis.map(kpi => ({
        id: kpi.id,
        key: kpi.key,
        name: kpi.name,
        description: kpi.description,
        category: kpi.category,
        required: kpi.required,
        weight: parseFloat(kpi.weight),
        min_evidence_length: kpi.min_evidence_length
      }))
    };

  } catch (error) {
    logger.error('Error in getActiveKpiSet', {
      role,
      seniorityLevel,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: 'Failed to retrieve KPI set'
    };
  }
}

/**
 * Get KPI set by ID (for version-locked references)
 *
 * @param {string} kpiSetId - UUID of the KPI set
 * @returns {Promise<{success: boolean, kpiSet?: object, kpis?: array, error?: string}>}
 */
export async function getKpiSetById(kpiSetId) {
  try {
    if (!kpiSetId) {
      return { success: false, error: 'KPI Set ID is required' };
    }

    const { data: kpiSet, error: setError } = await supabase
      .from('kpi_sets')
      .select('*')
      .eq('id', kpiSetId)
      .maybeSingle();

    if (setError) {
      logger.error('Failed to fetch KPI set by ID', {
        kpiSetId,
        error: setError.message
      });
      throw setError;
    }

    if (!kpiSet) {
      return { success: false, error: 'KPI set not found' };
    }

    const { data: kpis, error: kpisError } = await supabase
      .from('kpis')
      .select('*')
      .eq('kpi_set_id', kpiSet.id)
      .order('key', { ascending: true });

    if (kpisError) {
      logger.error('Failed to fetch KPIs for set', {
        kpiSetId,
        error: kpisError.message
      });
      throw kpisError;
    }

    return {
      success: true,
      kpiSet: {
        id: kpiSet.id,
        role: kpiSet.role,
        seniority_level: kpiSet.seniority_level,
        version: kpiSet.version,
        active: kpiSet.active,
        description: kpiSet.description,
        created_at: kpiSet.created_at
      },
      kpis: kpis.map(kpi => ({
        id: kpi.id,
        key: kpi.key,
        name: kpi.name,
        description: kpi.description,
        category: kpi.category,
        required: kpi.required,
        weight: parseFloat(kpi.weight),
        min_evidence_length: kpi.min_evidence_length
      }))
    };

  } catch (error) {
    logger.error('Error in getKpiSetById', {
      kpiSetId,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: 'Failed to retrieve KPI set'
    };
  }
}

/**
 * Get required KPIs for a KPI set
 * Used for validation during reference submission
 *
 * @param {string} kpiSetId - UUID of the KPI set
 * @returns {Promise<Array<{id: string, key: string, min_evidence_length: number}>>}
 */
export async function getRequiredKpis(kpiSetId) {
  try {
    const { data: kpis, error } = await supabase
      .from('kpis')
      .select('id, key, name, min_evidence_length')
      .eq('kpi_set_id', kpiSetId)
      .eq('required', true);

    if (error) {
      logger.error('Failed to fetch required KPIs', {
        kpiSetId,
        error: error.message
      });
      return [];
    }

    return kpis || [];

  } catch (error) {
    logger.error('Error in getRequiredKpis', {
      kpiSetId,
      error: error.message
    });
    return [];
  }
}

/**
 * Validate that all required KPIs are present in submission
 *
 * @param {string} kpiSetId - UUID of the KPI set
 * @param {Array<{kpi_id: string}>} submittedKpis - Array of submitted KPI scores
 * @returns {Promise<{valid: boolean, missingKpis?: Array<string>, error?: string}>}
 */
export async function validateRequiredKpis(kpiSetId, submittedKpis) {
  try {
    const requiredKpis = await getRequiredKpis(kpiSetId);
    const submittedKpiIds = new Set(submittedKpis.map(k => k.kpi_id));

    const missingKpis = requiredKpis.filter(kpi => !submittedKpiIds.has(kpi.id));

    if (missingKpis.length > 0) {
      return {
        valid: false,
        missingKpis: missingKpis.map(kpi => ({
          id: kpi.id,
          key: kpi.key,
          name: kpi.name
        }))
      };
    }

    return { valid: true };

  } catch (error) {
    logger.error('Error in validateRequiredKpis', {
      kpiSetId,
      error: error.message
    });

    return {
      valid: false,
      error: 'Failed to validate required KPIs'
    };
  }
}

/**
 * Get KPI by ID
 * Used for validation during reference submission
 *
 * @param {string} kpiId - UUID of the KPI
 * @returns {Promise<{success: boolean, kpi?: object, error?: string}>}
 */
export async function getKpiById(kpiId) {
  try {
    const { data: kpi, error } = await supabase
      .from('kpis')
      .select('*')
      .eq('id', kpiId)
      .maybeSingle();

    if (error) {
      logger.error('Failed to fetch KPI by ID', {
        kpiId,
        error: error.message
      });
      throw error;
    }

    if (!kpi) {
      return { success: false, error: 'KPI not found' };
    }

    return {
      success: true,
      kpi: {
        id: kpi.id,
        kpi_set_id: kpi.kpi_set_id,
        key: kpi.key,
        name: kpi.name,
        description: kpi.description,
        category: kpi.category,
        required: kpi.required,
        weight: parseFloat(kpi.weight),
        min_evidence_length: kpi.min_evidence_length
      }
    };

  } catch (error) {
    logger.error('Error in getKpiById', {
      kpiId,
      error: error.message
    });

    return {
      success: false,
      error: 'Failed to retrieve KPI'
    };
  }
}

/**
 * Validate that all submitted KPIs belong to the specified KPI set
 *
 * @param {string} kpiSetId - UUID of the KPI set
 * @param {Array<{kpi_id: string}>} submittedKpis - Array of submitted KPI scores
 * @returns {Promise<{valid: boolean, invalidKpis?: Array<string>, error?: string}>}
 */
export async function validateKpisBelongToSet(kpiSetId, submittedKpis) {
  try {
    const { data: validKpis, error } = await supabase
      .from('kpis')
      .select('id')
      .eq('kpi_set_id', kpiSetId);

    if (error) {
      logger.error('Failed to fetch KPIs for validation', {
        kpiSetId,
        error: error.message
      });
      throw error;
    }

    const validKpiIds = new Set(validKpis.map(k => k.id));
    const invalidKpis = submittedKpis.filter(kpi => !validKpiIds.has(kpi.kpi_id));

    if (invalidKpis.length > 0) {
      return {
        valid: false,
        invalidKpis: invalidKpis.map(kpi => kpi.kpi_id)
      };
    }

    return { valid: true };

  } catch (error) {
    logger.error('Error in validateKpisBelongToSet', {
      kpiSetId,
      error: error.message
    });

    return {
      valid: false,
      error: 'Failed to validate KPIs'
    };
  }
}

/**
 * List all available roles (distinct from kpi_sets)
 *
 * @returns {Promise<{success: boolean, roles?: Array<string>, error?: string}>}
 */
export async function listAvailableRoles() {
  try {
    const { data, error } = await supabase
      .from('kpi_sets')
      .select('role')
      .eq('active', true);

    if (error) {
      logger.error('Failed to fetch available roles', {
        error: error.message
      });
      throw error;
    }

    // Get unique roles
    const roles = [...new Set(data.map(row => row.role))].sort();

    return {
      success: true,
      roles
    };

  } catch (error) {
    logger.error('Error in listAvailableRoles', {
      error: error.message
    });

    return {
      success: false,
      error: 'Failed to retrieve available roles'
    };
  }
}
