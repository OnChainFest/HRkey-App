import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function persistAnchorMetadata(referenceId, metadata) {
  return supabase
    .from('references')
    .update(metadata)
    .eq('id', referenceId);
}

export async function persistPendingAnchorMetadata(referenceId, metadata) {
  await persistAnchorMetadata(referenceId, metadata);
  return metadata;
}

export async function autoAnchorReferencePack(
  referenceId,
  { mode = 'non-blocking', persistPending, completeAnchor } = {}
) {
  const pendingMetadata = await persistPending(referenceId);

  if (mode === 'non-blocking') {
    return pendingMetadata;
  }

  try {
    const anchoredMetadata = await completeAnchor(referenceId, pendingMetadata);
    await persistAnchorMetadata(referenceId, anchoredMetadata);
    return anchoredMetadata;
  } catch (error) {
    const failedMetadata = {
      anchor_status: 'failed',
      anchor_error: error.message
    };
    await persistAnchorMetadata(referenceId, failedMetadata);
    return failedMetadata;
  }
}
