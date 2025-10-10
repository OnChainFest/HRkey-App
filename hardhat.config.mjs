import '@nomicfoundation/hardhat-verify';
import 'dotenv/config';

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: '0.8.24',
  networks: {
    baseSepolia: { url: process.env.BASE_SEPOLIA_RPC, accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [] },
    base:        { url: process.env.BASE_MAINNET_RPC, accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [] },
  },
  etherscan: {
    apiKey: { baseSepolia: process.env.BASESCAN_API_KEY ?? '', base: process.env.BASESCAN_API_KEY ?? '' },
    customChains: [
      { network: 'baseSepolia', chainId: 84532, urls: { apiURL: 'https://api-sepolia.basescan.org/api', browserURL: 'https://sepolia.basescan.org' } },
      { network: 'base',        chainId: 8453,  urls: { apiURL: 'https://api.basescan.org/api',        browserURL: 'https://basescan.org' } },
    ],
  },
};

export default config;
