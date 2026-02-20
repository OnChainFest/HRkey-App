#!/usr/bin/env node
import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';
import { createAnchorService } from '../protocol/anchor/anchorService.js';
import { getReferenceProof } from '../protocol/anchor/getReferenceProof.js';
import dotenv from 'dotenv';

dotenv.config();

const program = new Command();

program
  .name('anchor-reference')
  .description('Anchor professional references on Base blockchain')
  .version('1.0.0');

program
  .command('anchor')
  .description('Anchor a reference onchain')
  .requiredOption('--referenceId <id>', 'Reference ID from database')
  .option('--dry-run', 'Simulate without submitting transaction')
  .action(async (options) => {
    const { referenceId, dryRun } = options;

    console.log(`\n🔗 Anchoring reference: ${referenceId}`);
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

    try {
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

program.parse();
