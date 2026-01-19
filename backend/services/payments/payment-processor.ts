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
import { getNotificationManager } from '../notifications/notification-manager.js';

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

    // 7. Send payment request email to payer (if email provided)
    if (params.payerEmail) {
      try {
        await this.sendPaymentRequestEmail({
          payerEmail: params.payerEmail,
          amount: params.amount,
          referenceId: params.referenceId,
          qrCode,
          paymentUrl,
          expiresAt,
        });
        console.log(`   📧 Payment request email sent to ${params.payerEmail}`);
      } catch (emailError: any) {
        console.error(`   ⚠️  Failed to send payment email: ${emailError.message}`);
        // Don't throw - payment intent was created successfully
      }
    }

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
   * Send payment request email to payer
   */
  private async sendPaymentRequestEmail(params: {
    payerEmail: string;
    amount: number;
    referenceId: string;
    qrCode: string;
    paymentUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    const notificationManager = getNotificationManager();

    // Calculate expiry time in minutes
    const expiryMinutes = Math.floor(
      (params.expiresAt.getTime() - Date.now()) / 60000
    );

    // Generate payment request email HTML
    const subject = `Reference Verification Payment - $${params.amount} RLUSD`;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Request</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">💳 Payment Request</h1>
          </div>

          <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>

            <p style="font-size: 16px; margin-bottom: 25px;">
              A professional reference has been verified and is ready for your review.
              To access the verified reference, please complete the payment below.
            </p>

            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 25px 0;">
              <h3 style="margin-top: 0; color: #2d3748;">Payment Details:</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #4a5568;"><strong>Amount:</strong></td>
                  <td style="padding: 8px 0; text-align: right; color: #2d3748; font-size: 20px; font-weight: bold;">$${params.amount} RLUSD</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #4a5568;"><strong>Reference ID:</strong></td>
                  <td style="padding: 8px 0; text-align: right; color: #2d3748; font-family: monospace; font-size: 13px;">${params.referenceId.slice(0, 8)}...${params.referenceId.slice(-6)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #4a5568;"><strong>Expires in:</strong></td>
                  <td style="padding: 8px 0; text-align: right; color: #dc2626; font-weight: 600;">${expiryMinutes} minutes</td>
                </tr>
              </table>
            </div>

            <h3 style="color: #2d3748; margin-top: 30px; margin-bottom: 15px;">Payment Options:</h3>

            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 0 0 15px 0; font-weight: 600; color: #2d3748;">Option 1: Scan QR Code</p>
              <p style="margin: 0 0 15px 0; font-size: 14px; color: #4a5568;">
                Open your Web3 wallet app (MetaMask, Coinbase Wallet, etc.) and scan this QR code:
              </p>
              <div style="text-align: center; margin: 20px 0;">
                <img src="${params.qrCode}" alt="Payment QR Code" width="250" style="border: 2px solid #e2e8f0; border-radius: 8px; padding: 10px; background: white;" />
              </div>
            </div>

            <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6;">
              <p style="margin: 0 0 15px 0; font-weight: 600; color: #1e40af;">Option 2: Pay with Wallet Button</p>
              <p style="margin: 0 0 15px 0; font-size: 14px; color: #1e3a8a;">
                Click the button below to open your wallet app directly:
              </p>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${params.paymentUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Pay with Wallet</a>
              </div>
            </div>

            <div style="background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; border-radius: 4px; margin-top: 25px;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>⏰ Important:</strong> This payment link expires in ${expiryMinutes} minutes. If it expires, you'll need to request a new verification.
              </p>
            </div>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
              <h4 style="color: #2d3748; margin-bottom: 10px;">How the payment is distributed:</h4>
              <ul style="color: #4a5568; line-height: 1.8; font-size: 14px;">
                <li><strong>60%</strong> → Reference provider (for their time and expertise)</li>
                <li><strong>20%</strong> → Candidate (for building their professional profile)</li>
                <li><strong>15%</strong> → HRKey platform (for maintaining the service)</li>
                <li><strong>5%</strong> → Staking rewards pool (for token holders)</li>
              </ul>
            </div>

            <div style="margin-top: 25px; padding: 15px; background: #f7fafc; border-radius: 6px;">
              <p style="margin: 0; font-size: 13px; color: #4a5568;">
                <strong>Need help?</strong> Make sure you have:<br>
                • RLUSD tokens in your wallet on Base network<br>
                • Sufficient ETH for gas fees<br>
                • A Web3 wallet app (MetaMask, Coinbase Wallet, etc.)
              </p>
            </div>
          </div>

          <div style="text-align: center; padding: 20px; color: #718096; font-size: 12px;">
            <p>© ${new Date().getFullYear()} HRKey. All rights reserved.</p>
            <p>Secure payments powered by Base network and RLUSD stablecoin</p>
          </div>
        </body>
      </html>
    `;

    await notificationManager.sendEmail({
      to: params.payerEmail,
      subject,
      html,
    });
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
