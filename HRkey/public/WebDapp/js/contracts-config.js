// HRKey Smart Contract Configuration
const CONTRACTS = {
  HRKeyRegistry: {
    address: '0xFE79Ee969C7590467c89df9062846fb39Dbd5DCF',
    network: 'base-mainnet',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org'
  }
};

const NETWORK_CONFIG = {
  chainId: '0x2105',
  chainName: 'Base Mainnet',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org']
};

window.HRKEY_CONTRACT = CONTRACTS.HRKeyRegistry;
window.BASE_NETWORK_CONFIG = NETWORK_CONFIG;
