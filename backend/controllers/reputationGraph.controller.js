import logger from '../logger.js';
import { ReputationGraphError, ReputationGraphService } from '../services/reputationGraph.service.js';
import { createClient } from '@supabase/supabase-js';

let supabaseClient;

export function __setSupabaseClientForTests(client) {
  supabaseClient = client;
}

function getSupabaseClient() {
  const resolvedSupabaseUrl = process.env.SUPABASE_URL || 'https://example.supabase.co';
  const resolvedSupabaseServiceKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'test-service-role-key';

  if (process.env.NODE_ENV === 'test' && supabaseClient) {
    return supabaseClient;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey);
  }

  return supabaseClient;
}

const QUERYABLE_ENTITY_TYPES = Object.freeze(['candidate', 'company', 'reference']);

function hasNonEmptyIdentifier(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function canAccessEntityGraph(req, entityType, entityId) {
  const user = req.user;
  if (!user?.id) return false;
  if (user.role === 'superadmin') return true;

  if (entityType === 'candidate') {
    return user.id === entityId;
  }

  if (entityType === 'company') {
    const { data, error } = await getSupabaseClient()
      .from('company_signers')
      .select('id')
      .eq('company_id', entityId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to authorize company graph access', {
        requestId: req.requestId,
        userId: user.id,
        companyId: entityId,
        error: error.message
      });
      return false;
    }

    return !!data;
  }

  if (entityType === 'reference') {
    const { data, error } = await getSupabaseClient()
      .from('references')
      .select('id')
      .eq('id', entityId)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) {
      logger.warn('Failed to authorize reference graph access', {
        requestId: req.requestId,
        userId: user.id,
        referenceId: entityId,
        error: error.message
      });
      return false;
    }

    return !!data;
  }

  return false;
}

function handleGraphError(res, error, fallbackMessage) {
  if (error instanceof ReputationGraphError) {
    return res.status(error.status).json({
      ok: false,
      error: error.code,
      message: error.message
    });
  }

  return res.status(500).json({
    ok: false,
    error: 'INTERNAL_ERROR',
    message: fallbackMessage
  });
}

export async function getEntityGraph(req, res) {
  try {
    const { entityType, entityId } = req.params;

    if (!QUERYABLE_ENTITY_TYPES.includes(entityType) || !hasNonEmptyIdentifier(entityId)) {
      return res.status(400).json({ ok: false, error: 'INVALID_REQUEST', message: 'Invalid graph entity lookup' });
    }

    const allowed = await canAccessEntityGraph(req, entityType, entityId);
    if (!allowed) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Resource not found' });
    }

    const graph = await ReputationGraphService.getEntityGraph(entityType, entityId);

    return res.status(200).json({
      ok: true,
      ...graph
    });
  } catch (error) {
    logger.error('Failed to fetch entity reputation graph', {
      requestId: req.requestId,
      entityType: req.params.entityType,
      entityId: req.params.entityId,
      userId: req.user?.id,
      error: error.message
    });
    return handleGraphError(res, error, 'Failed to fetch reputation graph');
  }
}

export async function getNodeEdges(req, res) {
  try {
    const { nodeId } = req.params;
    if (!hasNonEmptyIdentifier(nodeId)) {
      return res.status(400).json({ ok: false, error: 'INVALID_NODE_ID', message: 'Valid node ID is required' });
    }

    const node = await ReputationGraphService.getNodeById(nodeId);
    if (!node) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Resource not found' });
    }

    const allowed = await canAccessEntityGraph(req, node.entity_type, node.entity_id);
    if (!allowed) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Resource not found' });
    }

    const [incomingEdges, outgoingEdges] = await Promise.all([
      ReputationGraphService.getIncomingEdges(nodeId),
      ReputationGraphService.getOutgoingEdges(nodeId)
    ]);

    return res.status(200).json({
      ok: true,
      node,
      incomingEdges,
      outgoingEdges
    });
  } catch (error) {
    logger.error('Failed to fetch reputation graph node edges', {
      requestId: req.requestId,
      nodeId: req.params.nodeId,
      userId: req.user?.id,
      error: error.message
    });
    return handleGraphError(res, error, 'Failed to fetch reputation graph edges');
  }
}
