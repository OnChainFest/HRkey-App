/**
 * Payment Processor Service
 *
 * Creates payment intents for reference purchases
 * Generates QR codes for wallet payments
 * Handles payment confirmations and status tracking
 */

import { ethers } from 'ethers';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';

interface CreatePaymentParams {
  referenceId: string;
  referenceProvider: string;
  candidate: string;
  amount: number; // in USD
  payerEmail?: string;
}

interface PaymentIntent {
  paymentId: string;
  referenceId: string;
  paymentAddress: string;
  amount: number;
  amountWei: string;
  qrCode: string;
  paymentUrl: string;
  expiresAt: Date;
  splits: {
    provider: number;
    candidate: number;
    treasury: number;
    staking: number;
  };
}

interface PaymentStatus {
  paymentId: string;
  status: 'pending' | 'completed' | 'expired' | 'failed';
  txHash?: string;
  blockNumber?: number;
  splits?: PaymentSplitStatus[];
  createdAt: Date;
  completedAt?: Date;
}

interface PaymentSplitStatus {
  recipientType: string;
  recipientAddress: string;
  amount: number;
  percentage: number;
}

export class PaymentProcessor {
  private supabase: SupabaseClient;
  private readonly PAYMENT_SPLITTER_ADDRESS: string;
  private readonly RLUSD_TOKEN_ADDRESS: string;
  private readonly BASE_CHAIN_ID: number = 8453;
  private readonly PAYMENT_EXPIRY_MINUTES: number = 15;

  constructor() {
    // Initialize Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not set');
    }
    this.supabase = createClient(supabaseUrl, supabaseKey);

    // Get contract addresses from environment
    this.PAYMENT_SPLITTER_ADDRESS = process.env.PAYMENT_SPLITTER_ADDRESS!;
    this.RLUSD_TOKEN_ADDRESS = process.env.RLUSD_TOKEN_ADDRESS!;

    if (!this.PAYMENT_SPLITTER_ADDRESS || !this.RLUSD_TOKEN_ADDRESS) {
      throw new Error('Contract addresses not set in environment');
    }

    console.log('✅ Payment Processor initialized');
  }

  /**
   * Create a payment intent for a reference purchase
   */
  async createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntent> {
    console.log('\n🔨 Creating payment intent:');
    console.log(`   Reference: ${params.referenceId}`);
    console.log(`   Amount: $${params.amount} RLUSD`);

    // 1. Validate recipients have wallet addresses
    const providerWallet = await this.getWalletAddress(params.referenceProvider);
    const candidateWallet = await this.getWalletAddress(params.candidate);

    if (!providerWallet) {
      throw new Error('Reference provider does not have a wallet address');
    }
    if (!candidateWallet) {
      throw new Error('Candidate does not have a wallet address');
    }

    // 2. Convert amount to RLUSD (6 decimals)
    const amountInRLUSD = ethers.parseUnits(params.amount.toString(), 6);

    // 3. Generate unique payment ID
    const paymentId = this.generatePaymentId();

    // 4. Calculate expiry time
    const expiresAt = new Date(
      Date.now() + this.PAYMENT_EXPIRY_MINUTES * 60 * 1000
    );

    // 5. Create payment record in database
    const { data: payment, error: insertError } = await this.supabase
      .from('payments')
      .insert({
        id: paymentId,
        reference_id: params.referenceId,
        payer_email: params.payerEmail,
        provider_address: providerWallet,
        candidate_address: candidateWallet,
        total_amount: amountInRLUSD.toString(),
        total_amount_usd: params.amount,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create payment record: ${insertError.message}`);
    }

    // 6. Generate payment URL and QR code
    const paymentUrl = this.generatePaymentUrl({
      referenceId: params.referenceId,
      amount: amountInRLUSD.toString(),
      provider: providerWallet,
      candidate: candidateWallet,
    });

    const qrCode = await QRCode.toDataURL(paymentUrl, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
    });

    console.log(`   ✅ Payment intent created (ID: ${paymentId})`);
    console.log(`   📱 QR code generated`);
    console.log(`   ⏰ Expires: ${expiresAt.toISOString()}`);

    return {
      paymentId,
      referenceId: params.referenceId,
      paymentAddress: this.PAYMENT_SPLITTER_ADDRESS,
      amount: params.amount,
      amountWei: amountInRLUSD.toString(),
      qrCode,
      paymentUrl,
      expiresAt,
      splits: {
        provider: 60,
        candidate: 20,
        treasury: 15,
        staking: 5,
      },
    };
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    const { data: payment, error } = await this.supabase
      .from('payments')
      .select('*, payment_splits(*)')
      .eq('id', paymentId)
      .single();

    if (error || !payment) {
      throw new Error('Payment not found');
    }

    const splits: PaymentSplitStatus[] = payment.payment_splits?.map(
      (split: any) => ({
        recipientType: split.recipient_type,
        recipientAddress: split.recipient_address,
        amount: split.amount_usd,
        percentage: split.percentage,
      })
    ) || [];

    return {
      paymentId: payment.id,
      status: payment.status,
      txHash: payment.tx_hash,
      blockNumber: payment.block_number,
      splits,
      createdAt: new Date(payment.created_at),
      completedAt: payment.completed_at ? new Date(payment.completed_at) : undefined,
    };
  }

  /**
   * Get wallet address for a user (by email or user ID)
   */
  private async getWalletAddress(identifier: string): Promise<string | null> {
    // Try to find by user ID first
    let query = this.supabase
      .from('users')
      .select('wallet_address')
      .eq('id', identifier)
      .single();

    let { data, error } = await query;

    // If not found, try by email
    if (error || !data) {
      query = this.supabase
        .from('users')
        .select('wallet_address')
        .eq('email', identifier)
        .single();

      const result = await query;
      data = result.data;
      error = result.error;
    }

    if (error || !data || !data.wallet_address) {
      return null;
    }

    return data.wallet_address;
  }

  /**
   * Generate unique payment ID
   */
  private generatePaymentId(): string {
    return `pay_${randomBytes(16).toString('hex')}`;
  }

  /**
   * Generate payment URL for wallet apps (EIP-681 format)
   */
  private generatePaymentUrl(params: {
    referenceId: string;
    amount: string;
    provider: string;
    candidate: string;
  }): string {
    // EIP-681: ethereum:<contract>@<chainId>/<function>?params
    // Example: ethereum:0x742d...@8453/processPayment?referenceId=0x123...&amount=100000000

    // Encode function call data
    const iface = new ethers.Interface([
      'function processPayment(bytes32 referenceId, address referenceProvider, address candidate, uint256 amount)',
    ]);

    const functionData = iface.encodeFunctionData('processPayment', [
      params.referenceId,
      params.provider,
      params.candidate,
      params.amount,
    ]);

    // Build EIP-681 URL
    const url =
      `ethereum:${this.PAYMENT_SPLITTER_ADDRESS}@${this.BASE_CHAIN_ID}?` +
      `data=${functionData}`;

    return url;
  }

  /**
   * Expire old pending payments (run via cron)
   */
  async expireOldPayments(): Promise<number> {
    const now = new Date().toISOString();

    const { data: expiredPayments, error } = await this.supabase
      .from('payments')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', now)
      .select();

    if (error) {
      console.error('Failed to expire payments:', error);
      return 0;
    }

    const count = expiredPayments?.length || 0;
    if (count > 0) {
      console.log(`⏰ Expired ${count} pending payment(s)`);
    }

    return count;
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(timeframe: '24h' | '7d' | '30d' = '24h'): Promise<{
    totalPayments: number;
    totalVolume: number;
    completedPayments: number;
    pendingPayments: number;
    expiredPayments: number;
    averagePayment: number;
  }> {
    const hoursAgo = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 720;
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

    const { data: payments, error } = await this.supabase
      .from('payments')
      .select('status, total_amount_usd')
      .gte('created_at', since);

    if (error || !payments) {
      return {
        totalPayments: 0,
        totalVolume: 0,
        completedPayments: 0,
        pendingPayments: 0,
        expiredPayments: 0,
        averagePayment: 0,
      };
    }

    const stats = payments.reduce(
      (acc, payment) => {
        acc.totalPayments++;
        acc.totalVolume += payment.total_amount_usd;

        if (payment.status === 'completed') acc.completedPayments++;
        if (payment.status === 'pending') acc.pendingPayments++;
        if (payment.status === 'expired') acc.expiredPayments++;

        return acc;
      },
      {
        totalPayments: 0,
        totalVolume: 0,
        completedPayments: 0,
        pendingPayments: 0,
        expiredPayments: 0,
      }
    );

    return {
      ...stats,
      averagePayment:
        stats.totalPayments > 0 ? stats.totalVolume / stats.totalPayments : 0,
    };
  }

  /**
   * Retry failed payment processing
   */
  async retryFailedPayment(paymentId: string): Promise<boolean> {
    const { data: payment, error } = await this.supabase
      .from('failed_payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (error || !payment) {
      throw new Error('Failed payment not found');
    }

    // TODO: Implement retry logic
    // For now, just mark as retrying
    await this.supabase
      .from('failed_payments')
      .update({
        status: 'retrying',
        retry_count: payment.retry_count + 1,
        last_retry_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    return true;
  }
}

// Export singleton instance
let processorInstance: PaymentProcessor | null = null;

export function getPaymentProcessor(): PaymentProcessor {
  if (!processorInstance) {
    processorInstance = new PaymentProcessor();
  }
  return processorInstance;
}

// Cron job to expire old payments
if (require.main === module) {
  const processor = getPaymentProcessor();

  // Run every 5 minutes
  setInterval(async () => {
    await processor.expireOldPayments();
  }, 5 * 60 * 1000);

  console.log('🔄 Payment expiry cron job started (runs every 5 minutes)');
}
