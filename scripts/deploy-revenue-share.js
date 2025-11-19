// scripts/deploy-revenue-share.js  (ESM)
import "dotenv/config";
import hre from "hardhat";
import { JsonRpcProvider, Wallet, ContractFactory } from "ethers";

/**
 * Deploy HRKeyRevenueShare contract to Base Sepolia testnet
 *
 * Requirements:
 * - BASE_SEPOLIA_RPC_URL in .env
 * - PRIVATE_KEY in .env
 * - PLATFORM_ADDRESS in .env (HRKey platform wallet address)
 *
 * Usage:
 * npx hardhat compile && node scripts/deploy-revenue-share.js
 */
async function main() {
  console.log("🚀 Deploying HRKeyRevenueShare contract to Base Sepolia...\n");

  const rpc = process.env.BASE_SEPOLIA_RPC_URL;
  const pk  = process.env.PRIVATE_KEY;
  const platformAddress = process.env.PLATFORM_ADDRESS || process.env.HRKEY_PLATFORM_ADDRESS;

  if (!rpc || !pk) {
    throw new Error("Missing BASE_SEPOLIA_RPC_URL or PRIVATE_KEY in .env");
  }

  if (!platformAddress) {
    throw new Error("Missing PLATFORM_ADDRESS in .env (HRKey platform wallet address)");
  }

  const provider = new JsonRpcProvider(rpc);
  const wallet   = new Wallet(pk, provider);

  console.log("Deploying from address:", wallet.address);
  console.log("Platform address:", platformAddress);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    console.error("❌ Deployer has 0 ETH. Please fund the wallet first.");
    process.exit(1);
  }

  // Read compiled artifact
  const artifact = await hre.artifacts.readArtifact("HRKeyRevenueShare");

  // Create factory and deploy
  const factory  = new ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log("Deploying contract...");
  const contract = await factory.deploy(platformAddress);  // Constructor argument

  console.log("Waiting for deployment...");
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("\n✅ HRKeyRevenueShare deployed at:", contractAddress);

  // Get initial configuration
  const feePercentages = await contract.getFeePercentages();
  console.log("\n📊 Initial Configuration:");
  console.log("  Platform Fee:", feePercentages[0].toString(), "basis points (", feePercentages[0] / 100, "%)");
  console.log("  User Fee:", feePercentages[1].toString(), "basis points (", feePercentages[1] / 100, "%)");
  console.log("  Ref Creator Fee:", feePercentages[2].toString(), "basis points (", feePercentages[2] / 100, "%)");
  console.log("  Platform Address:", await contract.platformAddress());

  console.log("\n📝 Next Steps:");
  console.log("1. Save contract address to .env:");
  console.log(`   REVENUE_SHARE_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("\n2. Add supported tokens (e.g., USDC):");
  console.log(`   npx hardhat run scripts/configure-revenue-share.js --network baseSepolia`);
  console.log("\n3. Verify contract on BaseScan:");
  console.log(`   npx hardhat verify --network baseSepolia ${contractAddress} ${platformAddress}`);
}

main().catch((e) => {
  console.error("❌ Deployment failed:", e);
  process.exit(1);
});
