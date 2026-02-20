#!/usr/bin/env node
import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';
import { createAnchorService } from '../protocol/anchor/anchorService.js';
import { getReferenceProof } from '../protocol/anchor/getReferenceProof.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// ── Multi-chain network registry ─────────────────────────────────────────────
const NETWORKS: Record<string, { chainId: number; rpcEnvKey: string; defaultRpc: string }> = {
  coston2:    { chainId: 114,      rpcEnvKey: 'COSTON2_RPC_URL',     defaultRpc: 'https://coston2-api.flare.network/ext/bc/C/rpc' },
  baseSepolia: { chainId: 84532,   rpcEnvKey: 'BASE_SEPOLIA_RPC_URL', defaultRpc: 'https://sepolia.base.org' },
  opSepolia:  { chainId: 11155420, rpcEnvKey: 'OP_SEPOLIA_RPC_URL',   defaultRpc: 'https://sepolia.optimism.io' },
};

/**
 * Read deployments/referenceAnchor.json and return the deployed address for
 * the given network. Throws a clear error if the network is not yet deployed.
 */
function resolveDeployment(network: string): { address: string; chainId: number } {
  const deploymentsPath = path.resolve(process.cwd(), 'deployments', 'referenceAnchor.json');
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(
      `No deployments file found at ${deploymentsPath}.\n` +
      `Deploy first: npx hardhat run scripts/deployReferenceAnchor.ts --network ${network}`
    );
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const deployment = deployments[network];
  if (!deployment) {
    const available = Object.keys(deployments).join(', ') || 'none';
    throw new Error(
      `No deployment found for network "${network}". Deployed networks: ${available}\n` +
      `Deploy first: npx hardhat run scripts/deployReferenceAnchor.ts --network ${network}`
    );
  }
  return { address: deployment.address, chainId: deployment.chainId };
}

const program = new Command();

program
  .name('anchor-reference')
  .description('Anchor professional references on Base blockchain')
  .version('1.0.0');

program
  .command('anchor')
  .description('Anchor a reference onchain')
  .requiredOption('--referenceId <id>', 'Reference ID from database')
  .option('--network <network>', 'Target network (coston2, baseSepolia, opSepolia)', 'baseSepolia')
  .option('--dry-run', 'Simulate without submitting transaction')
  .action(async (options) => {
    const { referenceId, dryRun, network } = options;

    console.log(`\n🔗 Anchoring reference: ${referenceId}`);
    console.log(`Network: ${network}`);
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

    try {
      // Resolve deployment for the selected network (fails fast if not deployed)
      const { address: deployedAddress, chainId } = resolveDeployment(network);
      const netCfg = NETWORKS[network];
      if (!netCfg) {
        throw new Error(`Unknown network "${network}". Available: ${Object.keys(NETWORKS).join(', ')}`);
      }
      const rpcUrl = process.env[netCfg.rpcEnvKey] || netCfg.defaultRpc;

      // Propagate network settings so createAnchorService() picks them up
      if (!process.env.ANCHOR_CONTRACT_ADDRESS) process.env.ANCHOR_CONTRACT_ADDRESS = deployedAddress;
      process.env.BASE_SEPOLIA_RPC = rpcUrl;       // createAnchorService reads this key
      process.env.CHAIN_ID = String(chainId);

      // FIXED: Support both SUPABASE_SERVICE_KEY and SUPABASE_SERVICE_ROLE_KEY
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey =
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl) {
        throw new Error('SUPABASE_URL environment variable is required');
      }

      if (!supabaseKey) {
        throw new Error('Neither SUPABASE_SERVICE_KEY nor SUPABASE_SERVICE_ROLE_KEY is set');
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch reference from database
      console.log('📥 Fetching reference from database...');
      const { data: reference, error } = await supabase
        .from('references')
        .select('*')
        .eq('id', referenceId)
        .single();

      if (error || !reference) {
        throw new Error(`Reference not found: ${referenceId}`);
      }

      console.log(`✅ Found reference from ${reference.referrer_id} for ${reference.owner_id}`);

      if (dryRun) {
        console.log('\n🔍 DRY RUN - Would anchor with:');
        console.log(`  Reference ID: ${reference.id}`);
        console.log(`  Created: ${reference.created_at}`);
        console.log(`  Rating: ${reference.overall_rating || 'N/A'}`);
        console.log('\n✅ Dry run complete (no transaction submitted)');
        return;
      }

      // Create anchor service
      const anchorService = createAnchorService();

      // Anchor reference onchain
      console.log('⛓️  Submitting anchor transaction...');
      const result = await anchorService.anchorReference(reference);

      console.log('\n✅ Reference anchored successfully!');
      console.log(`  Hash: ${result.hash}`);
      console.log(`  Tx: ${result.txHash}`);
      console.log(`  Block: ${result.blockNumber}`);
      console.log(`  Explorer: ${result.explorerUrl}\n`);

      // Save to database
      console.log('💾 Saving anchor proof to database...');

      // FIXED: Store result.canonicalJson (not JSON.stringify)
      const { error: insertError } = await supabase
        .from('reference_anchors')
        .insert({
          reference_id: referenceId,
          canonical_json: result.canonicalJson,  // NOT JSON.stringify(canonical)
          hash: result.hash,
          tx_hash: result.txHash,
          block_number: result.blockNumber,
          chain_id: result.chainId,
          anchoring_address: process.env.ANCHOR_SIGNER_ADDRESS || ''
        });

      if (insertError) {
        console.error('⚠️  Warning: Failed to save to database:', insertError.message);
      } else {
        console.log('✅ Anchor proof saved to database');
      }

    } catch (error: any) {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('verify')
  .description('Verify an anchored reference')
  .requiredOption('--referenceId <id>', 'Reference ID to verify')
  .action(async (options) => {
    const { referenceId } = options;

    console.log(`\n🔍 Verifying reference: ${referenceId}\n`);

    try {
      const proof = await getReferenceProof(referenceId);

      if (!proof.exists) {
        console.log('❌ No anchor found for this reference');
        return;
      }

      console.log('✅ Anchor found in database');
      console.log(`  Hash: ${proof.hash}`);
      console.log(`  Tx: ${proof.txHash}`);
      console.log(`  Block: ${proof.blockNumber}`);
      console.log(`  Chain ID: ${proof.chainId}`);
      console.log(`  Explorer: ${proof.explorerUrl}`);
      console.log(`  Onchain Verified: ${proof.isOnchainVerified ? '✅' : '❌'}`);

      if (proof.blockTimestamp) {
        console.log(`  Block Timestamp: ${new Date(proof.blockTimestamp * 1000).toISOString()}`);
      }

    } catch (error: any) {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('anchor-hash')
  .description('Anchor a raw bytes32 hash onchain (demo / testing — no DB required)')
  .requiredOption('--hash <bytes32>', 'Bytes32 hash to anchor (0x + 64 hex chars)')
  .requiredOption('--network <network>', 'Target network (coston2, baseSepolia, opSepolia)')
  .action(async (options) => {
    const { hash, network } = options;

    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      console.error('❌ --hash must be 0x followed by exactly 64 hex characters');
      process.exit(1);
    }

    const netCfg = NETWORKS[network];
    if (!netCfg) {
      console.error(`❌ Unknown network "${network}". Available: ${Object.keys(NETWORKS).join(', ')}`);
      process.exit(1);
    }

    try {
      const { address } = resolveDeployment(network);
      const rpcUrl = process.env[netCfg.rpcEnvKey] || netCfg.defaultRpc;
      const privateKey = process.env.ANCHOR_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

      if (!privateKey) {
        throw new Error('Set ANCHOR_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY env var');
      }

      console.log(`\n⛓️  Anchoring raw hash on ${network}`);
      console.log(`Contract : ${address}`);
      console.log(`Hash     : ${hash}`);
      console.log(`RPC      : ${rpcUrl}`);

      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(
        address,
        ['function anchorReference(bytes32 referenceHash) external'],
        wallet
      );

      const tx = await contract.anchorReference(hash);
      console.log(`Tx hash  : ${tx.hash}`);
      console.log('Waiting for confirmation...');

      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error(`Transaction failed: ${tx.hash}`);
      }

      console.log('\n✅ Hash anchored successfully!');
      console.log(`  Contract : ${address}`);
      console.log(`  Tx hash  : ${receipt.hash}`);
      console.log(`  Block    : ${receipt.blockNumber}`);
      console.log(`  Network  : ${network} (chainId: ${netCfg.chainId})`);

    } catch (error: any) {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
