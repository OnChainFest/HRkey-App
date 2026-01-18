/**
 * Deployment script for HRKey Payment Rail on Base
 * Deploys: ReferencePaymentSplitter, ReputationRegistry
 * Integrates with existing HRKStaking contract
 */

import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('=== HRKey Payment Rail Deployment to Base ===\n');

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with account: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.formatEther(balance)} ETH\n`);

  // Configuration from environment
  const RLUSD_TOKEN_ADDRESS = process.env.RLUSD_TOKEN_ADDRESS;
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address;
  const STAKING_CONTRACT_ADDRESS = process.env.STAKING_CONTRACT_ADDRESS;

  // Validation
  if (!RLUSD_TOKEN_ADDRESS) {
    throw new Error('RLUSD_TOKEN_ADDRESS not set in .env');
  }

  console.log('Configuration:');
  console.log(`  RLUSD Token:        ${RLUSD_TOKEN_ADDRESS}`);
  console.log(`  Treasury:           ${TREASURY_ADDRESS}`);
  console.log(`  Staking Contract:   ${STAKING_CONTRACT_ADDRESS || 'Will deploy new'}`);
  console.log('');

  let paymentSplitterAddress: string;
  let reputationRegistryAddress: string;

  try {
    // 1. Deploy ReputationRegistry first (no dependencies)
    console.log('[1/2] Deploying ReputationRegistry...');
    const ReputationRegistry = await ethers.getContractFactory('ReputationRegistry');
    const reputationRegistry = await ReputationRegistry.deploy(deployer.address);
    await reputationRegistry.waitForDeployment();
    reputationRegistryAddress = await reputationRegistry.getAddress();
    console.log(`✅ ReputationRegistry deployed to: ${reputationRegistryAddress}\n`);

    // 2. Deploy ReferencePaymentSplitter
    console.log('[2/2] Deploying ReferencePaymentSplitter...');

    const stakingAddress = STAKING_CONTRACT_ADDRESS || deployer.address; // Use deployer as fallback

    const ReferencePaymentSplitter = await ethers.getContractFactory('ReferencePaymentSplitter');
    const paymentSplitter = await ReferencePaymentSplitter.deploy(
      RLUSD_TOKEN_ADDRESS,
      TREASURY_ADDRESS,
      stakingAddress
    );
    await paymentSplitter.waitForDeployment();
    paymentSplitterAddress = await paymentSplitter.getAddress();
    console.log(`✅ ReferencePaymentSplitter deployed to: ${paymentSplitterAddress}\n`);

    // 3. Configure roles and permissions
    console.log('[3/3] Configuring roles and permissions...');

    // Grant REGISTRAR_ROLE to PaymentSplitter (so it can register references)
    const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes('REGISTRAR_ROLE'));
    await reputationRegistry.grantRole(REGISTRAR_ROLE, paymentSplitterAddress);
    console.log(`✅ Granted REGISTRAR_ROLE to PaymentSplitter`);

    // Grant VERIFIER_ROLE to PaymentSplitter (so it can verify references after payment)
    const VERIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('VERIFIER_ROLE'));
    await reputationRegistry.grantRole(VERIFIER_ROLE, paymentSplitterAddress);
    console.log(`✅ Granted VERIFIER_ROLE to PaymentSplitter`);

    console.log('');

    // 4. Verify deployment
    console.log('[4/4] Verifying deployment...');

    // Check PaymentSplitter config
    const config = await paymentSplitter.getConfig();
    console.log(`  RLUSD Token:    ${config._rlusd}`);
    console.log(`  Treasury:       ${config._treasury}`);
    console.log(`  Staking Pool:   ${config._stakingPool}`);

    // Check split percentages
    const splits = await paymentSplitter.getSplitPercentages();
    console.log(`\n  Split Percentages:`);
    console.log(`    Provider:     ${splits.provider / 100}%`);
    console.log(`    Candidate:    ${splits.candidate / 100}%`);
    console.log(`    Treasury:     ${splits.treasuryPct / 100}%`);
    console.log(`    Staking:      ${splits.staking / 100}%`);

    // Test calculateSplit function
    const testAmount = ethers.parseUnits('100', 6); // 100 RLUSD (6 decimals)
    const splitAmounts = await paymentSplitter.calculateSplit(testAmount);
    console.log(`\n  Example: 100 RLUSD payment splits to:`);
    console.log(`    Provider:     ${ethers.formatUnits(splitAmounts.providerAmount, 6)} RLUSD`);
    console.log(`    Candidate:    ${ethers.formatUnits(splitAmounts.candidateAmount, 6)} RLUSD`);
    console.log(`    Treasury:     ${ethers.formatUnits(splitAmounts.treasuryAmount, 6)} RLUSD`);
    console.log(`    Staking:      ${ethers.formatUnits(splitAmounts.stakingAmount, 6)} RLUSD`);

    console.log('');

    // 5. Deployment Summary
    console.log('=== Deployment Summary ===\n');
    console.log(`Contract Addresses:`);
    console.log(`  ReferencePaymentSplitter: ${paymentSplitterAddress}`);
    console.log(`  ReputationRegistry:       ${reputationRegistryAddress}`);

    console.log(`\nKey Parameters:`);
    console.log(`  RLUSD Token:   ${RLUSD_TOKEN_ADDRESS}`);
    console.log(`  Treasury:      ${TREASURY_ADDRESS}`);
    console.log(`  Staking Pool:  ${stakingAddress}`);

    console.log(`\nPayment Split:`);
    console.log(`  60% → Reference Provider`);
    console.log(`  20% → Candidate`);
    console.log(`  15% → Treasury`);
    console.log(`  5%  → HRK Staking Pool`);

    console.log(`\nNext Steps:`);
    console.log(`  1. Verify contracts on Basescan:`);
    console.log(`     npx hardhat verify --network base ${paymentSplitterAddress} "${RLUSD_TOKEN_ADDRESS}" "${TREASURY_ADDRESS}" "${stakingAddress}"`);
    console.log(`     npx hardhat verify --network base ${reputationRegistryAddress} "${deployer.address}"`);
    console.log(`  2. Update .env with new contract addresses`);
    console.log(`  3. Deploy backend payment listener service`);
    console.log(`  4. Configure RLUSD token approvals for PaymentSplitter`);
    console.log(`  5. Test payment flow on testnet first`);

    // Save deployment info
    const deploymentInfo = {
      network: (await ethers.provider.getNetwork()).name,
      chainId: (await ethers.provider.getNetwork()).chainId.toString(),
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      treasury: TREASURY_ADDRESS,
      rlusdToken: RLUSD_TOKEN_ADDRESS,
      contracts: {
        ReferencePaymentSplitter: paymentSplitterAddress,
        ReputationRegistry: reputationRegistryAddress,
      },
      configuration: {
        splitPercentages: {
          provider: '60%',
          candidate: '20%',
          treasury: '15%',
          staking: '5%'
        },
        stakingPoolAddress: stakingAddress,
      },
      roles: {
        ReputationRegistry: {
          DEFAULT_ADMIN_ROLE: deployer.address,
          REGISTRAR_ROLE: [paymentSplitterAddress],
          VERIFIER_ROLE: [paymentSplitterAddress],
        }
      }
    };

    const outputPath = path.join(process.cwd(), 'deployment-payment-rail.json');
    fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

    console.log(`\n✅ Deployment complete! Details saved to deployment-payment-rail.json\n`);

    // Save ABIs for backend integration
    console.log('Saving ABIs for backend integration...');
    const abiDir = path.join(process.cwd(), 'abis');
    if (!fs.existsSync(abiDir)) {
      fs.mkdirSync(abiDir, { recursive: true });
    }

    // Get contract artifacts
    const PaymentSplitterArtifact = await ethers.getContractFactory('ReferencePaymentSplitter');
    const RegistryArtifact = await ethers.getContractFactory('ReputationRegistry');

    fs.writeFileSync(
      path.join(abiDir, 'ReferencePaymentSplitter.json'),
      JSON.stringify({
        address: paymentSplitterAddress,
        abi: PaymentSplitterArtifact.interface.formatJson()
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(abiDir, 'ReputationRegistry.json'),
      JSON.stringify({
        address: reputationRegistryAddress,
        abi: RegistryArtifact.interface.formatJson()
      }, null, 2)
    );

    console.log(`✅ ABIs saved to ${abiDir}/\n`);

  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
