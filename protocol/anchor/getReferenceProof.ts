import { createClient } from '@supabase/supabase-js';
import { ethers, Interface } from 'ethers';

const ANCHOR_EVENT_ABI = ['event ReferenceAnchored(bytes32 indexed referenceHash, address indexed anchoringAddress, uint256 timestamp)'];

export async function getReferenceProof(referenceId: string) {
  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch anchor record from database
  const { data: anchor, error } = await supabase
    .from('reference_anchors')
    .select('*')
    .eq('reference_id', referenceId)
    .single();

  if (error || !anchor) {
    return {
      exists: false,
      referenceId,
      message: 'No anchor found for this reference'
    };
  }

  // Verify onchain proof
  const rpcUrl = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  let isOnchainVerified = false;
  let blockTimestamp = null;

  try {
    const receipt = await provider.getTransactionReceipt(anchor.tx_hash);

    if (!receipt) {
      throw new Error(`Transaction receipt not found for ${anchor.tx_hash}`);
    }

    // FIXED: Use Interface.parseLog() to decode event args
    const anchorInterface = new Interface(ANCHOR_EVENT_ABI);
    const eventSignature = ethers.id('ReferenceAnchored(bytes32,address,uint256)');  // FIXED: ethers.id not ethors.id

    const matchingLogs = receipt.logs.filter(log => log.topics[0] === eventSignature);

    for (const log of matchingLogs) {
      const parsed = anchorInterface.parseLog({
        topics: [...log.topics],
        data: log.data
      });

      if (parsed && parsed.args.referenceHash.toLowerCase() === anchor.hash.toLowerCase()) {
        isOnchainVerified = true;
        break;
      }
    }

    // Get block timestamp
    const block = await provider.getBlock(receipt.blockNumber);
    if (block) {
      blockTimestamp = block.timestamp;
    }

  } catch (err: any) {
    console.error('Error verifying onchain proof:', err);
  }

  return {
    exists: true,
    referenceId: anchor.reference_id,
    canonicalJson: anchor.canonical_json,
    hash: anchor.hash,
    txHash: anchor.tx_hash,
    blockNumber: anchor.block_number,
    chainId: anchor.chain_id,
    anchoringAddress: anchor.anchoring_address,
    isOnchainVerified,
    blockTimestamp,
    createdAt: anchor.created_at,
    explorerUrl: `https://sepolia.basescan.org/tx/${anchor.tx_hash}`
  };
}
