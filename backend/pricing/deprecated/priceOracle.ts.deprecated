/**
 * HRKey Price Oracle Service
 * Generates Merkle trees and publishes price roots on-chain
 */

import { MerkleTree } from 'merkletreejs';
import { keccak256 } from 'ethers/lib/utils';
import { ethers } from 'ethers';
import { calculateAllPrices, storePricesInDB } from './pricingEngine';

// Contract ABI (minimal, just what we need)
const PRICE_ORACLE_ABI = [
  'function updatePriceRoot(bytes32 newRoot) external',
  'function getPriceInfo() external view returns (bytes32 root, uint256 timestamp, uint256 updates)',
  'function verifyPrice(address candidate, uint256 priceHRK, bytes32[] calldata merkleProof) external view returns (bool)',
];

// Environment variables
const PROVIDER_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY || '';
const PRICE_ORACLE_ADDRESS = process.env.PRICE_ORACLE_ADDRESS || '';

/**
 * Initialize provider and contract
 */
export function getOracleContract() {
  const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
  const wallet = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(PRICE_ORACLE_ADDRESS, PRICE_ORACLE_ABI, wallet);

  return { provider, wallet, contract };
}

/**
 * Generate Merkle tree from candidate prices
 * @param prices Map of candidate wallet addresses to prices
 * @returns MerkleTree instance
 */
export function generateMerkleTree(prices: Map<string, number>): MerkleTree {
  // Convert prices to leaves
  const leaves = Array.from(prices.entries()).map(([wallet, price]) => {
    // Convert price to wei (18 decimals)
    const priceWei = ethers.utils.parseEther(price.toString());

    // Create leaf: keccak256(abi.encodePacked(address, uint256))
    const packed = ethers.utils.solidityPack(
      ['address', 'uint256'],
      [wallet, priceWei]
    );

    return keccak256(packed);
  });

  // Create Merkle tree
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

  console.log(`Generated Merkle tree with ${leaves.length} leaves`);
  console.log(`Merkle root: ${tree.getHexRoot()}`);

  return tree;
}

/**
 * Generate Merkle proof for a specific candidate
 * @param tree MerkleTree instance
 * @param candidateWallet Candidate's wallet address
 * @param price Price in HRK
 * @returns Merkle proof as hex strings
 */
export function generateMerkleProof(
  tree: MerkleTree,
  candidateWallet: string,
  price: number
): string[] {
  // Convert price to wei
  const priceWei = ethers.utils.parseEther(price.toString());

  // Create leaf
  const packed = ethers.utils.solidityPack(
    ['address', 'uint256'],
    [candidateWallet, priceWei]
  );
  const leaf = keccak256(packed);

  // Generate proof
  const proof = tree.getHexProof(leaf);

  return proof;
}

/**
 * Generate Merkle proof from prices map (convenience function)
 * @param prices Map of all candidate prices
 * @param candidateWallet Specific candidate to generate proof for
 * @returns Merkle proof
 */
export async function generateProofForCandidate(
  prices: Map<string, number>,
  candidateWallet: string
): Promise<string[]> {
  const price = prices.get(candidateWallet);

  if (!price) {
    throw new Error(`Price not found for candidate: ${candidateWallet}`);
  }

  const tree = generateMerkleTree(prices);
  const proof = generateMerkleProof(tree, candidateWallet, price);

  return proof;
}

/**
 * Publish Merkle root on-chain
 * @param root Merkle root as bytes32
 * @returns Transaction hash
 */
export async function publishRootOnChain(root: string): Promise<string> {
  try {
    const { contract, wallet } = getOracleContract();

    console.log(`Publishing Merkle root: ${root}`);
    console.log(`Oracle address: ${wallet.address}`);

    // Check if we can update (6 hour interval check)
    const priceInfo = await contract.getPriceInfo();
    const lastUpdate = priceInfo.timestamp.toNumber();
    const now = Math.floor(Date.now() / 1000);
    const timeSinceUpdate = now - lastUpdate;

    if (timeSinceUpdate < 6 * 60 * 60) {
      console.warn(`Update too frequent. Last update was ${timeSinceUpdate}s ago. Waiting...`);
      return '';
    }

    // Estimate gas
    const gasEstimate = await contract.estimateGas.updatePriceRoot(root);
    const gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer

    // Send transaction
    const tx = await contract.updatePriceRoot(root, {
      gasLimit,
    });

    console.log(`Transaction sent: ${tx.hash}`);
    console.log('Waiting for confirmation...');

    // Wait for confirmation
    const receipt = await tx.wait();

    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    return tx.hash;
  } catch (error: any) {
    console.error('Error publishing root on-chain:', error);
    throw new Error(`Failed to publish root: ${error.message}`);
  }
}

/**
 * Verify a price on-chain
 * @param candidateWallet Candidate's wallet address
 * @param price Price in HRK
 * @param proof Merkle proof
 * @returns True if price is valid
 */
export async function verifyPriceOnChain(
  candidateWallet: string,
  price: number,
  proof: string[]
): Promise<boolean> {
  try {
    const { contract } = getOracleContract();

    const priceWei = ethers.utils.parseEther(price.toString());

    const isValid = await contract.verifyPrice(candidateWallet, priceWei, proof);

    console.log(`Price verification for ${candidateWallet}: ${isValid}`);

    return isValid;
  } catch (error: any) {
    console.error('Error verifying price on-chain:', error);
    return false;
  }
}

/**
 * Main update function (called by cron job every 6 hours)
 */
export async function updatePricesAndPublish(): Promise<void> {
  console.log('=== Starting Price Oracle Update ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  try {
    // 1. Calculate prices for all candidates
    console.log('\n[Step 1/4] Calculating prices...');
    const prices = await calculateAllPrices();

    if (prices.size === 0) {
      console.warn('No prices calculated. Aborting update.');
      return;
    }

    // 2. Store prices in database
    console.log('\n[Step 2/4] Storing prices in database...');
    await storePricesInDB(prices);

    // 3. Generate Merkle tree
    console.log('\n[Step 3/4] Generating Merkle tree...');
    const tree = generateMerkleTree(prices);
    const root = tree.getHexRoot();

    // 4. Publish root on-chain
    console.log('\n[Step 4/4] Publishing root on-chain...');
    const txHash = await publishRootOnChain(root);

    if (txHash) {
      console.log(`\n✅ Price oracle update complete!`);
      console.log(`Transaction: ${txHash}`);
      console.log(`Merkle root: ${root}`);
      console.log(`Prices updated: ${prices.size}`);
    } else {
      console.log('\n⏭️  Update skipped (too frequent)');
    }
  } catch (error: any) {
    console.error('\n❌ Price oracle update failed:', error);
    throw error;
  }
}

/**
 * Get current price root from contract
 */
export async function getCurrentPriceRoot(): Promise<{
  root: string;
  timestamp: number;
  updates: number;
}> {
  try {
    const { contract } = getOracleContract();
    const priceInfo = await contract.getPriceInfo();

    return {
      root: priceInfo.root,
      timestamp: priceInfo.timestamp.toNumber(),
      updates: priceInfo.updates.toNumber(),
    };
  } catch (error: any) {
    console.error('Error fetching price root:', error);
    throw error;
  }
}

/**
 * Test function to verify Merkle tree generation
 */
export async function testMerkleTree(): Promise<void> {
  console.log('=== Testing Merkle Tree Generation ===\n');

  // Create test prices
  const testPrices = new Map<string, number>([
    ['0x1111111111111111111111111111111111111111', 10.5],
    ['0x2222222222222222222222222222222222222222', 25.0],
    ['0x3333333333333333333333333333333333333333', 50.75],
    ['0x4444444444444444444444444444444444444444', 100.0],
  ]);

  console.log('Test prices:');
  testPrices.forEach((price, wallet) => {
    console.log(`  ${wallet}: ${price} HRK`);
  });

  // Generate tree
  const tree = generateMerkleTree(testPrices);
  const root = tree.getHexRoot();

  console.log(`\nMerkle root: ${root}`);

  // Generate proofs for each candidate
  console.log('\nMerkle proofs:');
  testPrices.forEach((price, wallet) => {
    const proof = generateMerkleProof(tree, wallet, price);
    console.log(`\n${wallet}:`);
    console.log(`  Price: ${price} HRK`);
    console.log(`  Proof length: ${proof.length}`);
    console.log(`  Proof: ${JSON.stringify(proof)}`);
  });

  console.log('\n✅ Merkle tree test complete!');
}

// If running directly, execute test
if (require.main === module) {
  testMerkleTree().catch(console.error);
}
