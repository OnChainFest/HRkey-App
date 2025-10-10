// hardhat.config.js  (ESM porque tu package.json tiene "type":"module")
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY;

export default {
  solidity: "0.8.24",
  networks: {
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: { baseSepolia: BASESCAN_API_KEY },
  },
};
