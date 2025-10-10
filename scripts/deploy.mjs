import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);
  const Contract = await ethers.getContractFactory('PeerProofRegistry');
  const contract = await Contract.deploy(); // añade args si tu constructor los requiere
  await contract.waitForDeployment();
  console.log('Deployed at:', await contract.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
