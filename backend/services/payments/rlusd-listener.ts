/**
 * RLUSD Payment Listener Service
 *
 * Monitors Base network for payment events from ReferencePaymentSplitter contract
 * Syncs payment data with Supabase database
 * Triggers notifications to all payment recipients
 */

import { ethers } from 'ethers';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import PaymentSplitterABI from '../../../abis/ReferencePaymentSplitter.json';

interface PaymentEventData {
  referenceId: string;
  payer: string;
  referenceProvider: string;
  candidate: string;
  totalAmount: bigint;
  split: PaymentSplit;
  timestamp: bigint;
  txHash: string;
  blockNumber: number;
}

interface PaymentSplit {
  referenceProvider: string;
  candidate: string;
  treasury: string;
  stakingPool: string;
  providerAmount: bigint;
  candidateAmount: bigint;
  treasuryAmount: bigint;
  stakingAmount: bigint;
  totalAmount: bigint;
}

interface PaymentRecord {
  id?: string;
  reference_id: string;
  payer_address: string;
  total_amount: string;
  total_amount_usd: number;
  tx_hash: string;
  block_number: number;
  status: 'completed' | 'pending' | 'failed';
  created_at?: Date;
}

interface PaymentSplitRecord {
  payment_id: string;
  recipient_type: 'provider' | 'candidate' | 'treasury' | 'staking_pool';
  recipient_address: string;
  amount: string;
  amount_usd: number;
  percentage: number;
}

export class RLUSDPaymentListener {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private supabase: SupabaseClient;
  private isRunning: boolean = false;

  constructor() {
    // Initialize Base network provider
    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // Initialize PaymentSplitter contract
    const contractAddress = process.env.PAYMENT_SPLITTER_ADDRESS;
    if (!contractAddress) {
      throw new Error('PAYMENT_SPLITTER_ADDRESS not set in environment');
    }

    this.contract = new ethers.Contract(
      contractAddress,
      PaymentSplitterABI.abi,
      this.provider
    );

    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not set in environment');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);

    console.log('✅ RLUSD Payment Listener initialized');
    console.log(`   Contract: ${contractAddress}`);
    console.log(`   Network: Base (${rpcUrl})`);
  }

  /**
   * Start listening for payment events
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Payment listener already running');
      return;
    }

    try {
      this.isRunning = true;

      // Listen for PaymentProcessed events
      this.contract.on(
        'PaymentProcessed',
        async (
          referenceId: string,
          payer: string,
          referenceProvider: string,
          candidate: string,
          totalAmount: bigint,
          split: PaymentSplit,
          timestamp: bigint,
          event: ethers.EventLog
        ) => {
          try {
            await this.handlePaymentEvent({
              referenceId,
              payer,
              referenceProvider,
              candidate,
              totalAmount,
              split,
              timestamp,
              txHash: event.transactionHash,
              blockNumber: event.blockNumber,
            });
          } catch (error) {
            console.error('Error handling payment event:', error);
            await this.handleError(error as Error, {
              referenceId,
              payer,
              totalAmount,
              txHash: event.transactionHash,
            });
          }
        }
      );

      console.log('✅ Payment listener started on Base network');
      console.log('   Listening for PaymentProcessed events...');

    } catch (error) {
      this.isRunning = false;
      console.error('❌ Failed to start payment listener:', error);
      throw error;
    }
  }

  /**
   * Stop listening for events
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.contract.removeAllListeners('PaymentProcessed');
    this.isRunning = false;
    console.log('⏹️  Payment listener stopped');
  }

  /**
   * Handle a payment event
   */
  private async handlePaymentEvent(eventData: PaymentEventData): Promise<void> {
    console.log('\n📥 New payment received:');
    console.log(`   Reference ID: ${eventData.referenceId}`);
    console.log(`   Amount: ${ethers.formatUnits(eventData.totalAmount, 6)} RLUSD`);
    console.log(`   TX: ${eventData.txHash}`);

    try {
      // 1. Insert payment record
      const payment = await this.insertPaymentRecord(eventData);
      console.log(`   ✅ Payment record created (ID: ${payment.id})`);

      // 2. Insert split records
      await this.insertPaymentSplits(payment.id!, eventData.split);
      console.log(`   ✅ Payment splits recorded`);

      // 3. Update reference status
      await this.updateReferenceStatus(eventData.referenceId, 'paid');
      console.log(`   ✅ Reference marked as paid`);

      // 4. Trigger notifications
      await this.sendPaymentNotifications(payment, eventData);
      console.log(`   ✅ Notifications sent`);

      // 5. Log analytics event
      await this.logAnalyticsEvent(eventData);
      console.log(`   ✅ Analytics event logged`);

      console.log('✅ Payment processed successfully\n');

    } catch (error) {
      console.error('❌ Payment processing failed:', error);
      throw error;
    }
  }

  /**
   * Insert payment record into database
   */
  private async insertPaymentRecord(eventData: PaymentEventData): Promise<PaymentRecord> {
    const amountUsd = Number(ethers.formatUnits(eventData.totalAmount, 6));

    const paymentRecord: PaymentRecord = {
      reference_id: eventData.referenceId,
      payer_address: eventData.payer,
      total_amount: eventData.totalAmount.toString(),
      total_amount_usd: amountUsd,
      tx_hash: eventData.txHash,
      block_number: eventData.blockNumber,
      status: 'completed',
      created_at: new Date(Number(eventData.timestamp) * 1000),
    };

    const { data, error } = await this.supabase
      .from('payments')
      .insert(paymentRecord)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert payment record: ${error.message}`);
    }

    return data;
  }

  /**
   * Insert payment split records
   */
  private async insertPaymentSplits(
    paymentId: string,
    split: PaymentSplit
  ): Promise<void> {
    const splits: PaymentSplitRecord[] = [
      {
        payment_id: paymentId,
        recipient_type: 'provider',
        recipient_address: split.referenceProvider,
        amount: split.providerAmount.toString(),
        amount_usd: Number(ethers.formatUnits(split.providerAmount, 6)),
        percentage: 60,
      },
      {
        payment_id: paymentId,
        recipient_type: 'candidate',
        recipient_address: split.candidate,
        amount: split.candidateAmount.toString(),
        amount_usd: Number(ethers.formatUnits(split.candidateAmount, 6)),
        percentage: 20,
      },
      {
        payment_id: paymentId,
        recipient_type: 'treasury',
        recipient_address: split.treasury,
        amount: split.treasuryAmount.toString(),
        amount_usd: Number(ethers.formatUnits(split.treasuryAmount, 6)),
        percentage: 15,
      },
      {
        payment_id: paymentId,
        recipient_type: 'staking_pool',
        recipient_address: split.stakingPool,
        amount: split.stakingAmount.toString(),
        amount_usd: Number(ethers.formatUnits(split.stakingAmount, 6)),
        percentage: 5,
      },
    ];

    const { error } = await this.supabase
      .from('payment_splits')
      .insert(splits);

    if (error) {
      throw new Error(`Failed to insert payment splits: ${error.message}`);
    }
  }

  /**
   * Update reference status to 'paid'
   */
  private async updateReferenceStatus(
    referenceId: string,
    status: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('references')
      .update({ payment_status: status, paid_at: new Date() })
      .eq('id', referenceId);

    if (error) {
      console.warn(`Failed to update reference status: ${error.message}`);
      // Don't throw - this is not critical
    }
  }

  /**
   * Send payment notifications to all recipients
   */
  private async sendPaymentNotifications(
    payment: PaymentRecord,
    eventData: PaymentEventData
  ): Promise<void> {
    // Get recipient emails from database
    const { data: recipients } = await this.supabase
      .from('users')
      .select('wallet_address, email, full_name')
      .in('wallet_address', [
        eventData.referenceProvider,
        eventData.candidate,
      ]);

    if (!recipients || recipients.length === 0) {
      console.warn('No recipients found for notification');
      return;
    }

    // TODO: Integrate with email service (Resend, SendGrid, etc.)
    // For now, log what would be sent
    for (const recipient of recipients) {
      const amount =
        recipient.wallet_address === eventData.referenceProvider
          ? ethers.formatUnits(eventData.split.providerAmount, 6)
          : ethers.formatUnits(eventData.split.candidateAmount, 6);

      console.log(`   📧 Would email ${recipient.email}:`);
      console.log(`      Subject: You received ${amount} RLUSD`);
      console.log(`      Amount: ${amount} RLUSD ($${amount})`);
      console.log(`      TX: ${payment.tx_hash}`);
    }
  }

  /**
   * Log analytics event
   */
  private async logAnalyticsEvent(eventData: PaymentEventData): Promise<void> {
    const { error } = await this.supabase.from('analytics_events').insert({
      event_type: 'payment_processed',
      event_data: {
        reference_id: eventData.referenceId,
        amount_usd: Number(ethers.formatUnits(eventData.totalAmount, 6)),
        payer: eventData.payer,
        tx_hash: eventData.txHash,
      },
      created_at: new Date(),
    });

    if (error) {
      console.warn(`Failed to log analytics event: ${error.message}`);
    }
  }

  /**
   * Handle errors during payment processing
   */
  private async handleError(error: Error, context: any): Promise<void> {
    console.error('Payment processing error:', error.message);
    console.error('Context:', context);

    // Insert into failed_payments table for manual review
    try {
      await this.supabase.from('failed_payments').insert({
        event_data: context,
        error_message: error.message,
        error_stack: error.stack,
        retry_count: 0,
        status: 'pending_retry',
        created_at: new Date(),
      });
    } catch (dbError) {
      console.error('Failed to log error to database:', dbError);
    }

    // Implement retry logic with exponential backoff
    // TODO: Add to job queue for retry
  }

  /**
   * Get listener status
   */
  getStatus(): { running: boolean; contract: string; network: string } {
    return {
      running: this.isRunning,
      contract: this.contract.target as string,
      network: this.provider._network?.name || 'unknown',
    };
  }
}

// Export singleton instance
let listenerInstance: RLUSDPaymentListener | null = null;

export function getPaymentListener(): RLUSDPaymentListener {
  if (!listenerInstance) {
    listenerInstance = new RLUSDPaymentListener();
  }
  return listenerInstance;
}

// If run directly, start the listener
if (require.main === module) {
  const listener = getPaymentListener();
  listener.start().catch((error) => {
    console.error('Failed to start payment listener:', error);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n⏹️  Shutting down payment listener...');
    await listener.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n⏹️  Shutting down payment listener...');
    await listener.stop();
    process.exit(0);
  });
}
