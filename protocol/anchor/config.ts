export const config = {
  explorerUrl: process.env.CHAIN_ID === '8453'
    ? 'https://basescan.org'
    : 'https://sepolia.basescan.org',

  rpcUrl: process.env.CHAIN_ID === '8453'
    ? process.env.BASE_MAINNET_RPC || 'https://mainnet.base.org'
    : process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',

  chainId: parseInt(process.env.CHAIN_ID || '84532')
};
