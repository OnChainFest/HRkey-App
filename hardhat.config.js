cd ~/HRKey-App
cp hardhat.config.js hardhat.config.js.bak.$(date +%Y%m%d-%H%M%S)

# Sobrescribe con un config correcto para Hardhat v3 (ESM)
cat > hardhat.config.js <<'EOF'
import '@nomicfoundation/hardhat-verify';
import 'dotenv/config';

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: '0.8.24',
  networks: {
    baseSepolia: {
      type: 'http',                                 // requerido por HH3
      url: process.env.BASE_SEPOLIA_RPC,            // p.ej. https://sepolia.base.org
      chainId: 84532,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },
    base: {
      type: 'http',                                 // requerido por HH3
      url: process.env.BASE_MAINNET_RPC,            // p.ej. https://mainnet.base.org
      chainId: 8453,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  etherscan: {
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY ?? '',
      base:        process.env.BASESCAN_API_KEY ?? ''
    },
    customChains: [
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org'
        }
      },
      {
        network: 'base',
        chainId: 8453,
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://basescan.org'
        }
      }
    ]
  }
};

export default config;
EOF
