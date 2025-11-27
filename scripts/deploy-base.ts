/**
 * Deployment script for HRKey contracts on Base
 * Deploys: HRKToken, HRKStaking, HRKSlashing, HRKPriceOracle
 */

import { ethers, upgrades } from 'hardhat';

async function main() {
  console.log('=== HRKey Token Deployment to Base ===\n');

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ETH\n`);

  // Deployment addresses (will be filled as we deploy)
  let hrkTokenAddress: string;
  let stakingAddress: string;
  let slashingAddress: string;
  let priceOracleAddress: string;

  // Treasury address (update this!)
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address;
  console.log(`Treasury address: ${TREASURY_ADDRESS}\n`);

  try {
    // 1. Deploy HRKToken
    console.log('[1/4] Deploying HRKToken...');
    const HRKToken = await ethers.getContractFactory('HRKToken');
    const hrkToken = await upgrades.deployProxy(
      HRKToken,
      [TREASURY_ADDRESS, deployer.address],
      { initializer: 'initialize', kind: 'uups' }
    );
    await hrkToken.deployed();
    hrkTokenAddress = hrkToken.address;
    console.log(`✅ HRKToken deployed to: ${hrkTokenAddress}\n`);

    // 2. Deploy HRKStaking
    console.log('[2/4] Deploying HRKStaking...');
    const HRKStaking = await ethers.getContractFactory('HRKStaking');
    const staking = await upgrades.deployProxy(
      HRKStaking,
      [hrkTokenAddress, deployer.address],
      { initializer: 'initialize', kind: 'uups' }
    );
    await staking.deployed();
    stakingAddress = staking.address;
    console.log(`✅ HRKStaking deployed to: ${stakingAddress}\n`);

    // 3. Deploy HRKSlashing
    console.log('[3/4] Deploying HRKSlashing...');
    const HRKSlashing = await ethers.getContractFactory('HRKSlashing');
    const slashing = await upgrades.deployProxy(
      HRKSlashing,
      [stakingAddress, hrkTokenAddress, deployer.address],
      { initializer: 'initialize', kind: 'uups' }
    );
    await slashing.deployed();
    slashingAddress = slashing.address;
    console.log(`✅ HRKSlashing deployed to: ${slashingAddress}\n`);

    // 4. Deploy HRKPriceOracle
    console.log('[4/4] Deploying HRKPriceOracle...');
    const HRKPriceOracle = await ethers.getContractFactory('HRKPriceOracle');
    const priceOracle = await upgrades.deployProxy(
      HRKPriceOracle,
      [hrkTokenAddress, TREASURY_ADDRESS, deployer.address],
      { initializer: 'initialize', kind: 'uups' }
    );
    await priceOracle.deployed();
    priceOracleAddress = priceOracle.address;
    console.log(`✅ HRKPriceOracle deployed to: ${priceOracleAddress}\n`);

    // 5. Grant roles
    console.log('[5/6] Setting up roles...');

    // Grant BURNER_ROLE to slashing contract
    const BURNER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BURNER_ROLE'));
    await hrkToken.grantRole(BURNER_ROLE, slashingAddress);
    console.log(`✅ Granted BURNER_ROLE to HRKSlashing`);

    // Grant REWARD_MANAGER_ROLE to deployer (for testing)
    const REWARD_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('REWARD_MANAGER_ROLE'));
    await staking.grantRole(REWARD_MANAGER_ROLE, deployer.address);
    console.log(`✅ Granted REWARD_MANAGER_ROLE to deployer`);

    // Grant ORACLE_ROLE to deployer (for price oracle updates)
    const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));
    await priceOracle.grantRole(ORACLE_ROLE, deployer.address);
    await slashing.grantRole(ORACLE_ROLE, deployer.address);
    console.log(`✅ Granted ORACLE_ROLE to deployer\n`);

    // 6. Summary
    console.log('=== Deployment Summary ===');
    console.log(`\nContract Addresses:`);
    console.log(`  HRKToken:      ${hrkTokenAddress}`);
    console.log(`  HRKStaking:    ${stakingAddress}`);
    console.log(`  HRKSlashing:   ${slashingAddress}`);
    console.log(`  HRKPriceOracle: ${priceOracleAddress}`);

    console.log(`\nKey Parameters:`);
    console.log(`  Total Supply:  1,000,000,000 HRK`);
    console.log(`  Treasury:      ${TREASURY_ADDRESS}`);
    console.log(`  Deployer:      ${deployer.address}`);

    console.log(`\nNext Steps:`);
    console.log(`  1. Verify contracts on Basescan`);
    console.log(`  2. Update .env with contract addresses`);
    console.log(`  3. Configure backend to use price oracle`);
    console.log(`  4. Distribute initial token allocations`);

    // Save addresses to file
    const fs = require('fs');
    const addresses = {
      network: 'base',
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      treasury: TREASURY_ADDRESS,
      contracts: {
        HRKToken: hrkTokenAddress,
        HRKStaking: stakingAddress,
        HRKSlashing: slashingAddress,
        HRKPriceOracle: priceOracleAddress,
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
