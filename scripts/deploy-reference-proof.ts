import { ethers } from 'hardhat';

async function main() {
  console.log('=== Deploy HRKReferenceProof ===');

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  const ReferenceProof = await ethers.getContractFactory('HRKReferenceProof');
  const referenceProof = await ReferenceProof.deploy();
  await referenceProof.waitForDeployment();
  const address = await referenceProof.getAddress();

  console.log(`✅ HRKReferenceProof deployed at: ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
