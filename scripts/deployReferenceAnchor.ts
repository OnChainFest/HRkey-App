/**
 * Deploy ReferenceAnchor to a target network.
 *
 * Usage:
 *   npx hardhat run scripts/deployReferenceAnchor.ts --network coston2
 *   npx hardhat run scripts/deployReferenceAnchor.ts --network baseSepolia
 *   npx hardhat run scripts/deployReferenceAnchor.ts --network opSepolia
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY  - deployer private key (0x-prefixed)
 *
 * Optional env vars (fall back to public RPCs):
 *   COSTON2_RPC_URL       - Flare Coston2 RPC endpoint
 *   BASE_SEPOLIA_RPC_URL  - Base Sepolia RPC endpoint
 *   OP_SEPOLIA_RPC_URL    - OP Sepolia RPC endpoint
 */

import hre from "hardhat";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Network metadata table – single source of truth
const NETWORK_META: Record<string, { chainId: number; rpcEnvKey: string; defaultRpc: string }> = {
  coston2: {
    chainId: 114,
    rpcEnvKey: "COSTON2_RPC_URL",
    defaultRpc: "https://coston2-api.flare.network/ext/bc/C/rpc",
  },
  baseSepolia: {
    chainId: 84532,
    rpcEnvKey: "BASE_SEPOLIA_RPC_URL",
    defaultRpc: "https://sepolia.base.org",
  },
  opSepolia: {
    chainId: 11155420,
    rpcEnvKey: "OP_SEPOLIA_RPC_URL",
    defaultRpc: "https://sepolia.optimism.io",
  },
};

async function main() {
  const networkName = hre.network.name;
  const meta = NETWORK_META[networkName];

  if (!meta) {
    throw new Error(
      `Unsupported network "${networkName}". Supported: ${Object.keys(NETWORK_META).join(", ")}`
    );
  }

  const { chainId, rpcEnvKey, defaultRpc } = meta;
  const rpcUrl = process.env[rpcEnvKey] || defaultRpc;

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "DEPLOYER_PRIVATE_KEY environment variable is required.\n" +
        "  export DEPLOYER_PRIVATE_KEY=0x<your-key>"
    );
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(privateKey, provider);

  console.log("\n=== ReferenceAnchor Deployment ===");
  console.log(`Network  : ${networkName}`);
  console.log(`Chain ID : ${chainId}`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`RPC      : ${rpcUrl}`);

  // Resolve artifact (must compile first: npx hardhat compile)
  const artifactPath = path.join(
    process.cwd(),
    "artifacts",
    "contracts",
    "ReferenceAnchor.sol",
    "ReferenceAnchor.json"
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Artifact not found at ${artifactPath}.\n` +
        "  Run 'npx hardhat compile' before deploying."
    );
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // ── Deploy ──────────────────────────────────────────────────────────────────
  console.log("\nDeploying ReferenceAnchor...");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const contract = await factory.deploy();

  const deployTx = contract.deploymentTransaction()!;
  console.log(`Tx hash  : ${deployTx.hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await deployTx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Deployment transaction failed: ${deployTx.hash}`);
  }

  const address = await contract.getAddress();
  const deployedAt = new Date().toISOString();

  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: process.cwd() })
      .toString()
      .trim();
  } catch (_) {
    // non-fatal – git may not be available in all CI environments
  }

  console.log("\n✅ ReferenceAnchor deployed!");
  console.log(`Address  : ${address}`);
  console.log(`Block    : ${receipt.blockNumber}`);
  console.log(`Deployed : ${deployedAt}`);
  console.log(`Commit   : ${commit}`);

  // ── Test anchor (demo) ───────────────────────────────────────────────────────
  // Anchor a clearly synthetic test hash to confirm the contract is live.
  const TEST_HASH = "0xdeadbeef00000000000000000000000000000000000000000000000000c0ffee";
  console.log("\n--- Post-deploy smoke anchor ---");
  console.log(`Test hash: ${TEST_HASH}`);

  const anchorContract = new ethers.Contract(
    address,
    ["function anchorReference(bytes32 referenceHash) external"],
    deployer
  );

  const anchorTx = await anchorContract.anchorReference(TEST_HASH);
  console.log(`Anchor tx: ${anchorTx.hash}`);
  const anchorReceipt = await anchorTx.wait();
  if (!anchorReceipt || anchorReceipt.status !== 1) {
    console.error("⚠️  Smoke anchor failed – contract deployed but anchorReference reverted.");
  } else {
    console.log(`✅ Smoke anchor confirmed in block ${anchorReceipt.blockNumber}`);
    console.log(`   Contract : ${address}`);
    console.log(`   Tx hash  : ${anchorReceipt.hash}`);
  }

  // ── Write deployment record ──────────────────────────────────────────────────
  const deploymentsDir = path.join(process.cwd(), "deployments");
  const deploymentsFile = path.join(deploymentsDir, "referenceAnchor.json");

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(deploymentsFile)) {
    existing = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  } else {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  existing[networkName] = {
    chainId,
    address,
    txHash: receipt.hash,
    deployedAt,
    commit,
  };

  fs.writeFileSync(deploymentsFile, JSON.stringify(existing, null, 2));
  console.log("\n📄 Deployment record saved to deployments/referenceAnchor.json");
  console.log(JSON.stringify(existing[networkName], null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error.message);
    process.exit(1);
  });
