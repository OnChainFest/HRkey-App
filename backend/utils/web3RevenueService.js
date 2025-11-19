// ============================================================================
// Web3 Revenue Service
// ============================================================================
// Integration service for HRKeyRevenueShare smart contract
// Handles on-chain revenue distribution (Phase 2 - currently stub)
// ============================================================================

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Contract configuration
const REVENUE_SHARE_CONTRACT_ADDRESS = process.env.REVENUE_SHARE_CONTRACT_ADDRESS;
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const BASE_MAINNET_RPC_URL = process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.PLATFORM_PRIVATE_KEY; // Platform wallet private key
const USDC_ADDRESS_BASE_SEPOLIA = process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Mock USDC on Base Sepolia

// Contract ABI (essential functions only)
const REVENUE_SHARE_ABI = [
  "function distributePayment(bytes32 requestId, address profileOwner, address refCreator, address token, uint256 totalAmount) external",
  "function calculateSplit(uint256 totalAmount) external view returns (uint256 platformAmount, uint256 userAmount, uint256 refCreatorAmount)",
  "function getFeePercentages() external view returns (uint16 platform, uint16 user, uint16 refCreator)",
  "function isTokenSupported(address token) external view returns (bool)",
  "function setSupportedToken(address token, bool supported) external",
  "event PaymentDistributed(bytes32 indexed requestId, address indexed payer, address indexed profileOwner, address refCreator, address token, uint256 totalAmount, uint256 platformAmount, uint256 userAmount, uint256 refCreatorAmount)"
];

// ============================================================================
// PROVIDER AND SIGNER SETUP
// ============================================================================

let provider = null;
let contract = null;
let signer = null;

/**
 * Initialize Web3 provider and contract instance
 */
export function initializeWeb3() {
  try {
    if (!REVENUE_SHARE_CONTRACT_ADDRESS) {
      console.warn('⚠️  REVENUE_SHARE_CONTRACT_ADDRESS not configured. Web3 revenue distribution disabled.');
      return false;
    }

    if (!PRIVATE_KEY) {
      console.warn('⚠️  PLATFORM_PRIVATE_KEY not configured. Web3 revenue distribution disabled.');
      return false;
    }

    const network = process.env.NODE_ENV === 'production' ? 'mainnet' : 'testnet';
    const rpcUrl = network === 'mainnet' ? BASE_MAINNET_RPC_URL : BASE_SEPOLIA_RPC_URL;

    provider = new ethers.JsonRpcProvider(rpcUrl);
    signer = new ethers.Wallet(PRIVATE_KEY, provider);
    contract = new ethers.Contract(REVENUE_SHARE_CONTRACT_ADDRESS, REVENUE_SHARE_ABI, signer);

    console.log('✅ Web3 Revenue Service initialized');
    console.log(`   Network: ${network}`);
    console.log(`   Contract: ${REVENUE_SHARE_CONTRACT_ADDRESS}`);
    console.log(`   Signer: ${signer.address}`);

    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Web3 Revenue Service:', error.message);
    return false;
  }
}

// ============================================================================
// REVENUE DISTRIBUTION FUNCTIONS
// ============================================================================

/**
 * Distribute payment on-chain via smart contract
 *
 * @param {Object} params
 * @param {string} params.requestId - Data access request ID (will be hashed to bytes32)
 * @param {string} params.profileOwnerAddress - User wallet address
 * @param {string} params.refCreatorAddress - Reference creator wallet address (or zero address)
 * @param {string} params.totalAmount - Total amount in token units (e.g., USDC has 6 decimals)
 * @param {string} params.tokenAddress - ERC20 token address (default: USDC)
 * @returns {Promise<Object>} - Transaction receipt and distribution details
 */
export async function distributeRevenueOnChain({
  requestId,
  profileOwnerAddress,
  refCreatorAddress = ethers.ZeroAddress,
  totalAmount,
  tokenAddress = USDC_ADDRESS_BASE_SEPOLIA
}) {
  if (!contract) {
    throw new Error('Web3 Revenue Service not initialized. Call initializeWeb3() first.');
  }

  try {
    // Convert requestId string to bytes32
    const requestIdBytes32 = ethers.id(requestId); // Keccak256 hash

    // Parse amount (assuming USDC with 6 decimals)
    const amountInUnits = ethers.parseUnits(totalAmount.toString(), 6);

    console.log('📤 Distributing payment on-chain...');
    console.log('   Request ID:', requestId);
    console.log('   Profile Owner:', profileOwnerAddress);
    console.log('   Ref Creator:', refCreatorAddress || 'None');
    console.log('   Amount:', totalAmount, 'USDC');

    // Send transaction
    const tx = await contract.distributePayment(
      requestIdBytes32,
      profileOwnerAddress,
      refCreatorAddress || ethers.ZeroAddress,
      tokenAddress,
      amountInUnits
    );

    console.log('⏳ Transaction sent:', tx.hash);
    console.log('   Waiting for confirmation...');

    // Wait for confirmation
    const receipt = await tx.wait();

    console.log('✅ Payment distributed on-chain!');
    console.log('   Block:', receipt.blockNumber);
    console.log('   Gas used:', receipt.gasUsed.toString());

    // Parse event logs
    const eventLog = receipt.logs.find(
      log => log.topics[0] === ethers.id('PaymentDistributed(bytes32,address,address,address,address,uint256,uint256,uint256,uint256)')
    );

    return {
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      eventLog: eventLog || null
    };
  } catch (error) {
    console.error('❌ On-chain distribution failed:', error);
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}

/**
 * Calculate revenue split amounts (view function - no gas cost)
 *
 * @param {number} totalAmount - Total amount to split
 * @returns {Promise<Object>} - Split amounts
 */
export async function calculateRevenueSplit(totalAmount) {
  if (!contract) {
    // Fallback calculation if Web3 not initialized
    return {
      platformAmount: (totalAmount * 0.40).toFixed(2),
      userAmount: (totalAmount * 0.40).toFixed(2),
      refCreatorAmount: (totalAmount * 0.20).toFixed(2)
    };
  }

  try {
    const amountInUnits = ethers.parseUnits(totalAmount.toString(), 6);
    const [platformAmount, userAmount, refCreatorAmount] = await contract.calculateSplit(amountInUnits);

    return {
      platformAmount: ethers.formatUnits(platformAmount, 6),
      userAmount: ethers.formatUnits(userAmount, 6),
      refCreatorAmount: ethers.formatUnits(refCreatorAmount, 6)
    };
  } catch (error) {
    console.error('❌ Failed to calculate split:', error);
    throw error;
  }
}

/**
 * Check if a token is supported by the contract
 *
 * @param {string} tokenAddress - ERC20 token address
 * @returns {Promise<boolean>}
 */
export async function isTokenSupported(tokenAddress) {
  if (!contract) {
    throw new Error('Web3 Revenue Service not initialized');
  }

  try {
    return await contract.isTokenSupported(tokenAddress);
  } catch (error) {
    console.error('❌ Failed to check token support:', error);
    return false;
  }
}

/**
 * Get current fee percentages from contract
 *
 * @returns {Promise<Object>} - Fee percentages
 */
export async function getFeePercentages() {
  if (!contract) {
    throw new Error('Web3 Revenue Service not initialized');
  }

  try {
    const [platform, user, refCreator] = await contract.getFeePercentages();
    return {
      platform: Number(platform) / 100, // Convert basis points to percentage
      user: Number(user) / 100,
      refCreator: Number(refCreator) / 100
    };
  } catch (error) {
    console.error('❌ Failed to get fee percentages:', error);
    throw error;
  }
}

// ============================================================================
// PAYOUT FUNCTIONS (for users and creators)
// ============================================================================

/**
 * Send payout to user wallet (direct transfer, not via contract)
 *
 * @param {string} walletAddress - User wallet address
 * @param {number} amount - Amount to send (in USD)
 * @param {string} tokenAddress - Token address (default USDC)
 * @returns {Promise<Object>} - Transaction receipt
 */
export async function payoutToUser(walletAddress, amount, tokenAddress = USDC_ADDRESS_BASE_SEPOLIA) {
  if (!signer) {
    throw new Error('Web3 Revenue Service not initialized');
  }

  try {
    // This would require the platform to have a funded wallet with USDC
    // For now, this is a stub that would be implemented in Phase 2

    console.log(`💸 Payout to user ${walletAddress}: ${amount} USDC`);
    console.log('⚠️  Phase 2: Implement actual token transfer here');

    // TODO Phase 2: Implement ERC20 transfer
    // const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    // const amountInUnits = ethers.parseUnits(amount.toString(), 6);
    // const tx = await token.transfer(walletAddress, amountInUnits);
    // const receipt = await tx.wait();
    // return { success: true, txHash: tx.hash };

    return {
      success: false,
      error: 'Payout not implemented yet (Phase 2)',
      stub: true
    };
  } catch (error) {
    console.error('❌ Payout failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send payout to reference creator wallet
 *
 * @param {string} walletAddress - Creator wallet address
 * @param {number} amount - Amount to send (in USD)
 * @param {string} tokenAddress - Token address (default USDC)
 * @returns {Promise<Object>} - Transaction receipt
 */
export async function payoutToRefCreator(walletAddress, amount, tokenAddress = USDC_ADDRESS_BASE_SEPOLIA) {
  // Same implementation as payoutToUser
  return payoutToUser(walletAddress, amount, tokenAddress);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get current gas price (for cost estimation)
 */
export async function getGasPrice() {
  if (!provider) {
    throw new Error('Web3 Revenue Service not initialized');
  }

  try {
    const feeData = await provider.getFeeData();
    return {
      gasPrice: ethers.formatUnits(feeData.gasPrice || 0n, 'gwei'),
      maxFeePerGas: ethers.formatUnits(feeData.maxFeePerGas || 0n, 'gwei'),
      maxPriorityFeePerGas: ethers.formatUnits(feeData.maxPriorityFeePerGas || 0n, 'gwei')
    };
  } catch (error) {
    console.error('❌ Failed to get gas price:', error);
    throw error;
  }
}

/**
 * Get platform wallet balance
 */
export async function getPlatformBalance() {
  if (!provider || !signer) {
    throw new Error('Web3 Revenue Service not initialized');
  }

  try {
    const ethBalance = await provider.getBalance(signer.address);

    // TODO Phase 2: Get USDC balance
    // const usdcContract = new ethers.Contract(USDC_ADDRESS_BASE_SEPOLIA, ERC20_ABI, provider);
    // const usdcBalance = await usdcContract.balanceOf(signer.address);

    return {
      address: signer.address,
      ethBalance: ethers.formatEther(ethBalance),
      // usdcBalance: ethers.formatUnits(usdcBalance, 6)
    };
  } catch (error) {
    console.error('❌ Failed to get platform balance:', error);
    throw error;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  initializeWeb3,
  distributeRevenueOnChain,
  calculateRevenueSplit,
  isTokenSupported,
  getFeePercentages,
  payoutToUser,
  payoutToRefCreator,
  getGasPrice,
  getPlatformBalance
};
