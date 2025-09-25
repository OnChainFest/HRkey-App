// scripts/deploy.js  (ESM)
import "dotenv/config";
import hre from "hardhat";
import { JsonRpcProvider, Wallet, ContractFactory } from "ethers";

async function main() {
  const rpc = process.env.BASE_SEPOLIA_RPC_URL;
  const pk  = process.env.PRIVATE_KEY;
  if (!rpc || !pk) throw new Error("Falta BASE_SEPOLIA_RPC_URL o PRIVATE_KEY en .env");

  const provider = new JsonRpcProvider(rpc);
  const wallet   = new Wallet(pk, provider);

  // Lee ABI y bytecode compilados por Hardhat
  const artifact = await hre.artifacts.readArtifact("PeerProofRegistry");

  const factory  = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();           // envia tx
  await contract.waitForDeployment();                // espera mined

  console.log("PeerProofRegistry deployed at:", await contract.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
