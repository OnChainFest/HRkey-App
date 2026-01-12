import type { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },

  networks: {
    // Hardhat 3 simulated network (in-memory)
    hardhat: {
      type: "edr-simulated",
      chainId: 31337,
    },

    // Local JSON-RPC node (anvil/geth/hardhat node)
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // Base Mainnet
    base: {
      type: "http",
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },

    // Base Sepolia
    baseSepolia: {
      type: "http",
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },

  paths: {
    sources: "./contracts",
    tests: "./contracts/test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  mocha: { timeout: 40000 },
};

export default config;
