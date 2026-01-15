/**
 * Deployment script for HRKey contracts on Base (Tokenomics v2.0)
 * Deploys: HRKToken, HRKBondedStaking, HRKSlashing
 *
 * CRITICAL CHANGES:
 * - NO HRKPriceOracle (marketplace pricing is USDC-only)
 * - NO yield/APY staking (bonded participation only)
 * - Slashing burns 100% (NO redistribution)
 */

import { ethers, upgrades } from 'hardhat';

async function main() {
  console.log('=== HRKey Token Deployment to Base ===\n');

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ETH\n`);

  // Deployment addresses (will be filled as we deploy)
  let hrkTokenAddress: string;
  let bondedStakingAddress: string;
  let slashingAddress: string;

  // Treasury address (update this!)
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address;
  console.log(`Treasury address: ${TREASURY_ADDRESS}\n`);

  try {
    // 1. Deploy HRKToken
    console.log('[1/3] Deploying HRKToken...');
    const HRKToken = await ethers.getContractFactory('HRKToken');
    const hrkToken = await upgrades.deployProxy(
      HRKToken,
      [TREASURY_ADDRESS, deployer.address],
      { initializer: 'initialize', kind: 'uups' }
    );
    await hrkToken.deployed();
    hrkTokenAddress = hrkToken.address;
    console.log(`✅ HRKToken deployed to: ${hrkTokenAddress}\n`);

    // 2. Deploy HRKBondedStaking (NO YIELD - capacity only)
    console.log('[2/3] Deploying HRKBondedStaking...');
    const UNBONDING_PERIOD = 7 * 24 * 60 * 60; // 7 days
    const HRKBondedStaking = await ethers.getContractFactory('HRKBondedStaking');
    const bondedStaking = await upgrades.deployProxy(
      HRKBondedStaking,
      [hrkTokenAddress, UNBONDING_PERIOD],
      { initializer: 'initialize', kind: 'uups' }
    );
    await bondedStaking.deployed();
    bondedStakingAddress = bondedStaking.address;
    console.log(`✅ HRKBondedStaking deployed to: ${bondedStakingAddress}`);
    console.log(`   Unbonding period: ${UNBONDING_PERIOD / 86400} days\n`);

    // 3. Deploy HRKSlashing (100% burn, NO redistribution)
    console.log('[3/3] Deploying HRKSlashing...');
    const HRKSlashing = await ethers.getContractFactory('HRKSlashing');
    const slashing = await upgrades.deployProxy(
      HRKSlashing,
      [bondedStakingAddress, hrkTokenAddress, deployer.address],
      { initializer: 'initialize', kind: 'uups' }
    );
    await slashing.deployed();
    slashingAddress = slashing.address;
    console.log(`✅ HRKSlashing deployed to: ${slashingAddress}\n`);

    // 4. Grant roles
    console.log('[4/4] Setting up roles...');

    // Grant SLASHER_ROLE to slashing contract on bonded staking
    const SLASHER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('SLASHER_ROLE'));
    await bondedStaking.grantRole(SLASHER_ROLE, slashingAddress);
    console.log(`✅ Granted SLASHER_ROLE to HRKSlashing on BondedStaking`);

    // Grant ORACLE_ROLE to deployer (for slashing proposals)
    const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));
    await slashing.grantRole(ORACLE_ROLE, deployer.address);
    console.log(`✅ Granted ORACLE_ROLE to deployer on Slashing\n`);

    // 5. Summary
    console.log('=== Tokenomics v2.0 Deployment Summary ===');
    console.log(`\nContract Addresses:`);
    console.log(`  HRKToken:         ${hrkTokenAddress}`);
    console.log(`  HRKBondedStaking: ${bondedStakingAddress}`);
    console.log(`  HRKSlashing:      ${slashingAddress}`);

    console.log(`\nKey Parameters:`);
    console.log(`  Total Supply:      1,000,000,000 HRK`);
    console.log(`  Treasury:          ${TREASURY_ADDRESS}`);
    console.log(`  Deployer:          ${deployer.address}`);
    console.log(`  Unbonding Period:  7 days`);

    console.log(`\nTokenomics Model:`);
    console.log(`  ✓ Marketplace pricing: USDC-only`);
    console.log(`  ✓ HRK staking: Bonded participation (NO yield)`);
    console.log(`  ✓ Slashing: 100% burn (NO redistribution)`);
    console.log(`  ✗ HRK-based pricing: REMOVED`);
    console.log(`  ✗ Revenue share to holders: REMOVED`);

    console.log(`\nNext Steps:`);
    console.log(`  1. Verify contracts on Basescan`);
    console.log(`  2. Update .env with contract addresses`);
    console.log(`  3. Configure backend for USDC pricing only`);
    console.log(`  4. Distribute initial token allocations`);

    // Save addresses to file
    const fs = require('fs');
    const addresses = {
      network: 'base',
      version: 'v2.0.0',
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      treasury: TREASURY_ADDRESS,
      unbondingPeriod: '7 days',
      contracts: {
        HRKToken: hrkTokenAddress,
        HRKBondedStaking: bondedStakingAddress,
        HRKSlashing: slashingAddress,
      },
      notes: {
        tokenomicsModel: 'USDC-only pricing, bonded participation staking, 100% slashing burn',
        removed: ['HRKPriceOracle', 'HRKStaking (yield-based)', 'Revenue share to holders'],
      },
    };

    fs.writeFileSync(
      'deployment-base.json',
      JSON.stringify(addresses, null, 2)
    );

    console.log(`\n✅ Deployment complete! Addresses saved to deployment-base.json\n`);
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
