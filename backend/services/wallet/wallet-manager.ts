/**
 * Wallet Manager Service
 *
 * Handles wallet creation, management, and validation for HRKey users
 * Supports both custodial (HRKey-managed) and non-custodial (user-connected) wallets
 */

import { ethers } from 'ethers';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

interface CreateWalletParams {
  userId: string;
  userEmail: string;
  walletType: 'custodial' | 'non_custodial';
  existingAddress?: string; // Required for non_custodial
}

interface WalletInfo {
  id: string;
  userId: string;
  address: string;
  type: 'custodial' | 'non_custodial';
  network: string;
  isPrimary: boolean;
  createdAt: Date;
}

interface WalletBalance {
  address: string;
  rlusdBalance: string; // in RLUSD (6 decimals)
  rlusdBalanceFormatted: string; // human-readable
  ethBalance: string; // in ETH (18 decimals)
  ethBalanceFormatted: string; // human-readable
}

interface EncryptedWallet {
  encryptedPrivateKey: string;
  iv: string;
  authTag: string;
}

export class WalletManager {
  private supabase: SupabaseClient;
  private provider: ethers.JsonRpcProvider;
  private readonly RLUSD_TOKEN_ADDRESS: string;
  private readonly ENCRYPTION_KEY: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';

  constructor() {
    // Initialize Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not set');
    }
    this.supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize provider for Base Sepolia (testnet)
    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // Get RLUSD token address
    this.RLUSD_TOKEN_ADDRESS = process.env.RLUSD_TOKEN_ADDRESS!;
    if (!this.RLUSD_TOKEN_ADDRESS) {
      throw new Error('RLUSD_TOKEN_ADDRESS not set in environment');
    }

    // Initialize encryption key
    const encryptionSecret = process.env.WALLET_ENCRYPTION_KEY;
    if (!encryptionSecret) {
      throw new Error('WALLET_ENCRYPTION_KEY not set in environment');
    }
    // Derive 32-byte key from secret using scrypt
    this.ENCRYPTION_KEY = scryptSync(encryptionSecret, 'hrkey-salt', 32);

    console.log('✅ Wallet Manager initialized');
  }

  /**
   * Create a custodial wallet for a user
   * Generates a new Ethereum wallet and encrypts the private key
   */
  async createCustodialWallet(params: {
    userId: string;
    userEmail: string;
  }): Promise<WalletInfo> {
    console.log(`\n🔐 Creating custodial wallet for user ${params.userId}`);

    // 1. Check if user already has a wallet
    const existing = await this.getWalletByUserId(params.userId);
    if (existing) {
      throw new Error(`User already has a wallet: ${existing.address}`);
    }

    // 2. Generate new Ethereum wallet
    const wallet = ethers.Wallet.createRandom();
    console.log(`   ✅ Wallet generated: ${wallet.address}`);

    // 3. Encrypt private key
    const encrypted = this.encryptPrivateKey(wallet.privateKey);
    const encryptedKeyData = JSON.stringify({
      encryptedKey: encrypted.encryptedPrivateKey,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    });

    // 4. Save to database
    const { data: walletRecord, error: insertError } = await this.supabase
      .from('user_wallets')
      .insert({
        user_id: params.userId,
        wallet_address: wallet.address,
        wallet_type: 'custodial',
        encrypted_private_key: encryptedKeyData,
        network: 'base_sepolia',
        is_primary: true,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to save wallet: ${insertError.message}`);
    }

    // 5. Update users table (synced via trigger, but we can also update directly)
    await this.supabase
      .from('users')
      .update({
        wallet_address: wallet.address,
        wallet_type: 'custodial',
        wallet_created_at: new Date().toISOString(),
      })
      .eq('id', params.userId);

    console.log(`   ✅ Custodial wallet created and saved`);

    return {
      id: walletRecord.id,
      userId: params.userId,
      address: wallet.address,
      type: 'custodial',
      network: 'base_sepolia',
      isPrimary: true,
      createdAt: new Date(walletRecord.created_at),
    };
  }

  /**
   * Link an existing non-custodial wallet (MetaMask, Coinbase, etc.)
   */
  async linkExistingWallet(params: {
    userId: string;
    address: string;
    walletType?: string; // 'metamask', 'coinbase', 'walletconnect'
  }): Promise<WalletInfo> {
    console.log(`\n🔗 Linking external wallet for user ${params.userId}`);

    // 1. Validate address
    if (!this.validateWalletAddress(params.address)) {
      throw new Error(`Invalid Ethereum address: ${params.address}`);
    }

    // 2. Check if user already has a wallet
    const existing = await this.getWalletByUserId(params.userId);
    if (existing) {
      throw new Error(`User already has a wallet: ${existing.address}`);
    }

    // 3. Normalize address (checksum format)
    const checksumAddress = ethers.getAddress(params.address);

    // 4. Save to database
    const { data: walletRecord, error: insertError } = await this.supabase
      .from('user_wallets')
      .insert({
        user_id: params.userId,
        wallet_address: checksumAddress,
        wallet_type: params.walletType || 'other',
        network: 'base_sepolia',
        is_primary: true,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to link wallet: ${insertError.message}`);
    }

    // 5. Update users table
    await this.supabase
      .from('users')
      .update({
        wallet_address: checksumAddress,
        wallet_type: 'non_custodial',
        wallet_created_at: new Date().toISOString(),
      })
      .eq('id', params.userId);

    console.log(`   ✅ Wallet linked: ${checksumAddress}`);

    return {
      id: walletRecord.id,
      userId: params.userId,
      address: checksumAddress,
      type: 'non_custodial',
      network: 'base_sepolia',
      isPrimary: true,
      createdAt: new Date(walletRecord.created_at),
    };
  }

  /**
   * Get wallet information by user ID
   */
  async getWalletByUserId(userId: string): Promise<WalletInfo | null> {
    const { data: wallet, error } = await this.supabase
      .from('user_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .single();

    if (error || !wallet) {
      // Also check users table as fallback
      const { data: user } = await this.supabase
        .from('users')
        .select('wallet_address, wallet_type, wallet_created_at')
        .eq('id', userId)
        .single();

      if (user && user.wallet_address) {
        return {
          id: userId, // Use user ID as fallback
          userId: userId,
          address: user.wallet_address,
          type: user.wallet_type || 'non_custodial',
          network: 'base_sepolia',
          isPrimary: true,
          createdAt: new Date(user.wallet_created_at || Date.now()),
        };
      }

      return null;
    }

    return {
      id: wallet.id,
      userId: wallet.user_id,
      address: wallet.wallet_address,
      type: wallet.wallet_type === 'custodial' ? 'custodial' : 'non_custodial',
      network: wallet.network,
      isPrimary: wallet.is_primary,
      createdAt: new Date(wallet.created_at),
    };
  }

  /**
   * Get wallet balance (RLUSD and ETH)
   */
  async getUserBalance(userId: string): Promise<WalletBalance | null> {
    console.log(`\n💰 Fetching balance for user ${userId}`);

    const wallet = await this.getWalletByUserId(userId);
    if (!wallet) {
      return null;
    }

    try {
      // Get ETH balance
      const ethBalance = await this.provider.getBalance(wallet.address);
      const ethFormatted = ethers.formatEther(ethBalance);

      // Get RLUSD balance (ERC20 token)
      const rlusdBalance = await this.getRLUSDBalance(wallet.address);
      const rlusdFormatted = ethers.formatUnits(rlusdBalance, 6); // RLUSD has 6 decimals

      console.log(`   ✅ ETH: ${ethFormatted}, RLUSD: ${rlusdFormatted}`);

      return {
        address: wallet.address,
        rlusdBalance: rlusdBalance.toString(),
        rlusdBalanceFormatted: rlusdFormatted,
        ethBalance: ethBalance.toString(),
        ethBalanceFormatted: ethFormatted,
      };
    } catch (error: any) {
      console.error(`   ❌ Failed to fetch balance: ${error.message}`);
      throw new Error(`Failed to fetch balance: ${error.message}`);
    }
  }

  /**
   * Get RLUSD token balance for an address
   */
  private async getRLUSDBalance(address: string): Promise<bigint> {
    // ERC20 ABI for balanceOf function
    const erc20Abi = [
      'function balanceOf(address owner) view returns (uint256)',
    ];

    const contract = new ethers.Contract(
      this.RLUSD_TOKEN_ADDRESS,
      erc20Abi,
      this.provider
    );

    const balance = await contract.balanceOf(address);
    return balance;
  }

  /**
   * Validate Ethereum wallet address
   */
  validateWalletAddress(address: string): boolean {
    try {
      ethers.getAddress(address); // Throws if invalid
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Encrypt private key using AES-256-GCM
   */
  private encryptPrivateKey(privateKey: string): EncryptedWallet {
    // Generate random IV (Initialization Vector)
    const iv = randomBytes(16);

    // Create cipher
    const cipher = createCipheriv(this.ALGORITHM, this.ENCRYPTION_KEY, iv);

    // Encrypt
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get auth tag for authenticated encryption
    const authTag = cipher.getAuthTag();

    return {
      encryptedPrivateKey: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt private key (used for custodial wallet transactions)
   */
  private decryptPrivateKey(encrypted: EncryptedWallet): string {
    const iv = Buffer.from(encrypted.iv, 'hex');
    const authTag = Buffer.from(encrypted.authTag, 'hex');

    // Create decipher
    const decipher = createDecipheriv(this.ALGORITHM, this.ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted.encryptedPrivateKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Get wallet instance for custodial wallet (for signing transactions)
   * CRITICAL: This exposes the private key and should ONLY be used in secure backend operations
   */
  async getCustodialWalletInstance(userId: string): Promise<ethers.Wallet> {
    console.log(`\n🔓 Loading custodial wallet for user ${userId}`);

    // 1. Get wallet record
    const { data: wallet, error } = await this.supabase
      .from('user_wallets')
      .select('wallet_address, wallet_type, encrypted_private_key')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .eq('wallet_type', 'custodial')
      .single();

    if (error || !wallet) {
      throw new Error('Custodial wallet not found for user');
    }

    if (!wallet.encrypted_private_key) {
      throw new Error('Private key not found for custodial wallet');
    }

    // 2. Decrypt private key
    const encryptedData = JSON.parse(wallet.encrypted_private_key);
    const privateKey = this.decryptPrivateKey({
      encryptedPrivateKey: encryptedData.encryptedKey,
      iv: encryptedData.iv,
      authTag: encryptedData.authTag,
    });

    // 3. Create wallet instance
    const walletInstance = new ethers.Wallet(privateKey, this.provider);

    console.log(`   ✅ Wallet loaded: ${walletInstance.address}`);

    return walletInstance;
  }

  /**
   * Check if user has a wallet
   */
  async hasWallet(userId: string): Promise<boolean> {
    const wallet = await this.getWalletByUserId(userId);
    return wallet !== null;
  }

  /**
   * Get wallet address by user ID (convenience method)
   */
  async getWalletAddress(userId: string): Promise<string | null> {
    const wallet = await this.getWalletByUserId(userId);
    return wallet?.address || null;
  }

  /**
   * Delete wallet (only for non-custodial wallets or with user confirmation)
   * CAUTION: For custodial wallets, funds should be withdrawn first
   */
  async deleteWallet(userId: string, confirmWithdrawal: boolean = false): Promise<void> {
    console.log(`\n🗑️ Deleting wallet for user ${userId}`);

    const wallet = await this.getWalletByUserId(userId);
    if (!wallet) {
      throw new Error('No wallet found for user');
    }

    // Check if custodial wallet
    if (wallet.type === 'custodial') {
      // Check balance before deletion
      const balance = await this.getUserBalance(userId);
      if (balance && parseFloat(balance.rlusdBalanceFormatted) > 0 && !confirmWithdrawal) {
        throw new Error(
          'Custodial wallet has balance. Please withdraw funds first or confirm deletion with confirmWithdrawal=true'
        );
      }

      console.warn(`   ⚠️ Deleting custodial wallet with RLUSD balance: ${balance?.rlusdBalanceFormatted || 0}`);
    }

    // Delete from user_wallets table
    const { error } = await this.supabase
      .from('user_wallets')
      .delete()
      .eq('user_id', userId)
      .eq('id', wallet.id);

    if (error) {
      throw new Error(`Failed to delete wallet: ${error.message}`);
    }

    // Clear wallet fields in users table
    await this.supabase
      .from('users')
      .update({
        wallet_address: null,
        wallet_type: null,
        wallet_created_at: null,
        encrypted_private_key: null,
      })
      .eq('id', userId);

    console.log(`   ✅ Wallet deleted`);
  }

  /**
   * Update wallet label
   */
  async updateWalletLabel(userId: string, label: string): Promise<void> {
    const wallet = await this.getWalletByUserId(userId);
    if (!wallet) {
      throw new Error('No wallet found for user');
    }

    const { error } = await this.supabase
      .from('user_wallets')
      .update({ label })
      .eq('id', wallet.id);

    if (error) {
      throw new Error(`Failed to update wallet label: ${error.message}`);
    }
  }
}

// Singleton instance
let walletManagerInstance: WalletManager | null = null;

/**
 * Get WalletManager singleton instance
 */
export function getWalletManager(): WalletManager {
  if (!walletManagerInstance) {
    walletManagerInstance = new WalletManager();
  }
  return walletManagerInstance;
}
