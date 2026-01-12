import { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";

// Hardhat 3: no uses @nomicfoundation/hardhat-toolbox (requiere Hardhat 2)
// Tampoco uses @openzeppelin/hardhat-upgrades ni @nomiclabs/hardhat-etherscan si no están instalados/compatibles.

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  networks: {
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 8453,
    },

    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 84532,
    },

    localhost: {
      url: "http://127.0.0.1:8545",
    },

    hardhat: {
      chainId: 31337,
    },
  },

  paths: {
    sources: "./contracts",
    tests: "./contracts/test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 40000,
  },
};

export default config;
