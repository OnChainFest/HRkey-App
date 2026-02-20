// =============================================================================
// Deploy HRKAnchorRegistry
// HRKey Grant Architecture Spec v1.0.0 — §4
// =============================================================================
// Usage:
//   npx hardhat run scripts/deploy-anchor-registry.js --network baseSepolia
//   npx hardhat run scripts/deploy-anchor-registry.js --network base
//
// Required env vars:
//   DEPLOYER_PRIVATE_KEY    — Deployer wallet private key
//   ISSUER_PUBLIC_KEY       — Backend issuer wallet address
//   BASE_SEPOLIA_RPC_URL    — Base Sepolia RPC endpoint
//   BASE_RPC_URL            — Base Mainnet RPC endpoint
// =============================================================================

import 'dotenv/config';
import hre from 'hardhat';
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';

async function main() {
  const network = hre.network.name;
  console.log(`\n[HRKAnchorRegistry] Deploying to network: ${network}`);

  // --- Validate environment ---
  const deployerKey  = process.env.DEPLOYER_PRIVATE_KEY;
  const issuerAddr   = process.env.ISSUER_PUBLIC_KEY;

  if (!deployerKey) throw new Error('Missing DEPLOYER_PRIVATE_KEY in .env');
  if (!issuerAddr)  throw new Error('Missing ISSUER_PUBLIC_KEY in .env');

  // --- Setup provider ---
  let rpcUrl;
  if (network === 'base') {
    rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  } else if (network === 'baseSepolia') {
    rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  } else {
    rpcUrl = 'http://127.0.0.1:8545'; // localhost
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const deployer = new Wallet(deployerKey, provider);

  const balance = await provider.getBalance(deployer.address);
  console.log(`[HRKAnchorRegistry] Deployer: ${deployer.address}`);
  console.log(`[HRKAnchorRegistry] Balance:  ${balance} wei`);
  console.log(`[HRKAnchorRegistry] Issuer:   ${issuerAddr}`);

  if (balance === 0n && network !== 'hardhat') {
    throw new Error('Deployer has zero balance. Fund the wallet before deploying.');
  }

  // --- Load artifact ---
  const artifact = await hre.artifacts.readArtifact('HRKAnchorRegistry');
  const factory  = new ContractFactory(artifact.abi, artifact.bytecode, deployer);

  // --- Deploy ---
  console.log('[HRKAnchorRegistry] Sending deployment transaction...');
  const contract = await factory.deploy(issuerAddr);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  console.log('\n========================================');
  console.log('  HRKAnchorRegistry DEPLOYED');
  console.log('========================================');
  console.log(`  Network:    ${network}`);
  console.log(`  Address:    ${address}`);
  console.log(`  Owner:      ${deployer.address}`);
  console.log(`  Issuer:     ${issuerAddr}`);
  console.log(`  TX Hash:    ${deployTx?.hash || 'N/A'}`);
  console.log('========================================\n');

  // --- Verify initial state ---
  const registryOwner  = await contract.owner();
  const registryIssuer = await contract.issuer();

  console.log(`[HRKAnchorRegistry] Verified owner:  ${registryOwner}`);
  console.log(`[HRKAnchorRegistry] Verified issuer: ${registryIssuer}`);

  console.log('\n[HRKAnchorRegistry] Add to .env:');
  console.log(`HRK_ANCHOR_REGISTRY_ADDRESS=${address}`);

  if (network === 'baseSepolia' || network === 'base') {
    const scanBase = network === 'base'
      ? 'https://basescan.org'
      : 'https://sepolia.basescan.org';
    console.log(`\n[HRKAnchorRegistry] Basescan: ${scanBase}/address/${address}`);
    console.log('[HRKAnchorRegistry] Verify with:');
    console.log(`  npx hardhat verify --network ${network} ${address} "${issuerAddr}"`);
  }
}

main().catch((e) => {
  console.error('[HRKAnchorRegistry] Deployment failed:', e.message);
  process.exit(1);
});
