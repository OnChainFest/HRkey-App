/**
 * Notification Manager Service
 *
 * Handles all notification delivery for HRKey users:
 * - In-app notifications (stored in database, shown in UI)
 * - Email notifications (via Resend)
 * - Push notifications (future implementation)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

type NotificationType =
  | 'payment_received'
  | 'payment_pending'
  | 'payment_failed'
  | 'reference_verified'
  | 'reference_flagged'
  | 'stake_reward'
  | 'stake_unlocked'
  | 'wallet_created'
  | 'data_access_requested'
  | 'data_access_approved';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  sendEmail?: boolean;
  sendPush?: boolean;
}

interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  readAt?: Date;
  emailSent: boolean;
  emailSentAt?: Date;
  createdAt: Date;
}

interface EmailNotificationParams {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export class NotificationManager {
  private supabase: SupabaseClient;
  private resend: Resend;
  private readonly FROM_EMAIL: string;

  constructor() {
    // Initialize Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not set');
    }
    this.supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn('⚠️  RESEND_API_KEY not set - email notifications will be disabled');
      this.resend = null as any; // Will check before sending
    } else {
      this.resend = new Resend(resendKey);
    }

    this.FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'HRKey <noreply@hrkey.com>';

    console.log('✅ Notification Manager initialized');
  }

  /**
   * Create an in-app notification (and optionally send email/push)
   */
  async createNotification(params: CreateNotificationParams): Promise<Notification> {
    console.log(`\n📬 Creating notification for user ${params.userId}`);
    console.log(`   Type: ${params.type}`);
    console.log(`   Title: ${params.title}`);

    // 1. Insert into database
    const { data: notification, error: insertError } = await this.supabase
      .from('notifications')
      .insert({
        user_id: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        data: params.data || {},
        read: false,
        email_sent: false,
        push_sent: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create notification: ${insertError.message}`);
    }

    console.log(`   ✅ In-app notification created (ID: ${notification.id})`);

    // 2. Send email if requested
    if (params.sendEmail) {
      try {
        await this.sendEmailForNotification(params.userId, params.type, params.title, params.message, params.data);

        // Update notification record
        await this.supabase
          .from('notifications')
          .update({
            email_sent: true,
            email_sent_at: new Date().toISOString(),
          })
          .eq('id', notification.id);

        console.log(`   ✅ Email sent`);
      } catch (error: any) {
        console.error(`   ❌ Failed to send email: ${error.message}`);
        // Don't throw - notification was created successfully
      }
    }

    // 3. Send push notification if requested (future)
    if (params.sendPush) {
      // TODO: Implement push notifications via Firebase/OneSignal
      console.log(`   ⏭️  Push notifications not yet implemented`);
    }

    return {
      id: notification.id,
      userId: notification.user_id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      read: notification.read,
      emailSent: notification.email_sent,
      createdAt: new Date(notification.created_at),
    };
  }

  /**
   * Send email notification for a specific notification type
   */
  private async sendEmailForNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    // Get user email
    const { data: user, error } = await this.supabase
      .from('users')
      .select('email, name')
      .eq('id', userId)
      .single();

    if (error || !user?.email) {
      throw new Error('User email not found');
    }

    // Generate email content based on type
    const emailContent = this.generateEmailContent(type, title, message, data, user.name);

    // Send email
    await this.sendEmail({
      to: user.email,
      toName: user.name,
      subject: emailContent.subject,
      html: emailContent.html,
    });
  }

  /**
   * Generate email HTML content based on notification type
   */
  private generateEmailContent(
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, any>,
    userName?: string
  ): { subject: string; html: string } {
    const greeting = userName ? `Hi ${userName},` : 'Hi,';

    switch (type) {
      case 'payment_received':
        return {
          subject: `💰 Payment Received - ${data?.amount || ''} RLUSD`,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">💰 ${title}</h1>
                </div>

                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
                  <p style="font-size: 16px; margin-bottom: 20px;">${greeting}</p>

                  <p style="font-size: 16px; margin-bottom: 25px;">${message}</p>

                  <div style="background: #f7fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 25px 0;">
                    <h3 style="margin-top: 0; color: #2d3748;">Transaction Details:</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; color: #4a5568;"><strong>Amount:</strong></td>
                        <td style="padding: 8px 0; text-align: right; color: #2d3748; font-size: 18px; font-weight: bold;">${data?.amount || 'N/A'} RLUSD</td>
                      </tr>
                      ${data?.reference_id ? `
                      <tr>
                        <td style="padding: 8px 0; color: #4a5568;"><strong>Reference ID:</strong></td>
                        <td style="padding: 8px 0; text-align: right; color: #2d3748;">${data.reference_id}</td>
                      </tr>
                      ` : ''}
                      ${data?.tx_hash ? `
                      <tr>
                        <td style="padding: 8px 0; color: #4a5568;"><strong>Transaction:</strong></td>
                        <td style="padding: 8px 0; text-align: right;">
                          <a href="https://sepolia.basescan.org/tx/${data.tx_hash}" style="color: #667eea; text-decoration: none;" target="_blank">View on BaseScan →</a>
                        </td>
                      </tr>
                      ` : ''}
                    </table>
                  </div>

                  <div style="text-align: center; margin-top: 30px;">
                    <a href="https://hrkey.com/wallet" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">View in Your Wallet</a>
                  </div>

                  <p style="color: #718096; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                    The funds are now in your wallet and you can withdraw them anytime.
                  </p>
                </div>

                <div style="text-align: center; padding: 20px; color: #718096; font-size: 12px;">
                  <p>© ${new Date().getFullYear()} HRKey. All rights reserved.</p>
                  <p>Own Your Professional Story</p>
                </div>
              </body>
            </html>
          `,
        };

      case 'payment_pending':
        return {
          subject: `Payment Request - ${data?.amount || ''} RLUSD`,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #f59e0b; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">⏳ ${title}</h1>
                </div>

                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
                  <p style="font-size: 16px;">${greeting}</p>
                  <p style="font-size: 16px;">${message}</p>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://hrkey.com/wallet" style="display: inline-block; background: #f59e0b; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Details</a>
                  </div>
                </div>
              </body>
            </html>
          `,
        };

      case 'reference_verified':
        return {
          subject: `✅ Reference Verified`,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #10b981; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">✅ ${title}</h1>
                </div>

                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
                  <p style="font-size: 16px;">${greeting}</p>
                  <p style="font-size: 16px;">${message}</p>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://hrkey.com/references" style="display: inline-block; background: #10b981; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Reference</a>
                  </div>
                </div>
              </body>
            </html>
          `,
        };

      case 'wallet_created':
        return {
          subject: `Welcome to HRKey Wallet`,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">👛 ${title}</h1>
                </div>

                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
                  <p style="font-size: 16px;">${greeting}</p>
                  <p style="font-size: 16px;">${message}</p>

                  ${data?.wallet_address ? `
                  <div style="background: #f7fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 14px; color: #4a5568;">Your Wallet Address:</p>
                    <p style="margin: 5px 0 0 0; font-family: 'Courier New', monospace; font-size: 13px; color: #2d3748; word-break: break-all;">${data.wallet_address}</p>
                  </div>
                  ` : ''}

                  <h3 style="color: #2d3748; margin-top: 25px;">How it works:</h3>
                  <ul style="color: #4a5568; line-height: 1.8;">
                    <li>When your references are verified, payments are automatically split</li>
                    <li>You receive 60% if you're the reference provider</li>
                    <li>You receive 20% if you're the candidate being referenced</li>
                    <li>Payments are in RLUSD (Ripple USD stablecoin) on Base network</li>
                  </ul>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://hrkey.com/wallet" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Your Wallet</a>
                  </div>

                  <div style="background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; border-radius: 4px; margin-top: 25px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px;">
                      <strong>Security Tip:</strong> ${data?.wallet_type === 'custodial' ? 'Your wallet is securely managed by HRKey. Never share your login credentials.' : 'Always verify the website URL before connecting your wallet.'}
                    </p>
                  </div>
                </div>
              </body>
            </html>
          `,
        };

      default:
        // Generic notification email
        return {
          subject: title,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #667eea; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">${title}</h1>
                </div>

                <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
                  <p style="font-size: 16px;">${greeting}</p>
                  <p style="font-size: 16px;">${message}</p>

                  <div style="text-align: center; margin: 30px 0;">
                    <a href="https://hrkey.com/dashboard" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Dashboard</a>
                  </div>
                </div>
              </body>
            </html>
          `,
        };
    }
  }

  /**
   * Send email via Resend
   */
  async sendEmail(params: EmailNotificationParams): Promise<void> {
    if (!this.resend) {
      console.warn('⚠️  Email sending skipped (Resend not configured)');
      return;
    }

    console.log(`📧 Sending email to ${params.to}`);

    try {
      await this.resend.emails.send({
        from: this.FROM_EMAIL,
        to: params.to,
        subject: params.subject,
        html: params.html,
        replyTo: params.replyTo,
      });

      console.log(`   ✅ Email sent successfully`);
    } catch (error: any) {
      console.error(`   ❌ Email send failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user's notifications
   */
  async getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      includeArchived?: boolean;
    } = {}
  ): Promise<Notification[]> {
    const {
      limit = 50,
      offset = 0,
      unreadOnly = false,
      includeArchived = false,
    } = options;

    let query = this.supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId);

    if (unreadOnly) {
      query = query.eq('read', false);
    }

    if (!includeArchived) {
      query = query.eq('archived', false);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: notifications, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch notifications: ${error.message}`);
    }

    return notifications.map((n) => ({
      id: n.id,
      userId: n.user_id,
      type: n.type,
      title: n.title,
      message: n.message,
      data: n.data,
      read: n.read,
      readAt: n.read_at ? new Date(n.read_at) : undefined,
      emailSent: n.email_sent,
      emailSentAt: n.email_sent_at ? new Date(n.email_sent_at) : undefined,
      createdAt: new Date(n.created_at),
    }));
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({
        read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', notificationId);

    if (error) {
      throw new Error(`Failed to mark notification as read: ${error.message}`);
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('notifications')
      .update({
        read: true,
        read_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('read', false)
      .select();

    if (error) {
      throw new Error(`Failed to mark all as read: ${error.message}`);
    }

    return data?.length || 0;
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
      .eq('archived', false);

    if (error) {
      throw new Error(`Failed to get unread count: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Archive notification
   */
  async archiveNotification(notificationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({
        archived: true,
        archived_at: new Date().toISOString(),
      })
      .eq('id', notificationId);

    if (error) {
      throw new Error(`Failed to archive notification: ${error.message}`);
    }
  }

  /**
   * Delete notification (hard delete)
   */
  async deleteNotification(notificationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) {
      throw new Error(`Failed to delete notification: ${error.message}`);
    }
  }
}

// Singleton instance
let notificationManagerInstance: NotificationManager | null = null;

/**
 * Get NotificationManager singleton instance
 */
export function getNotificationManager(): NotificationManager {
  if (!notificationManagerInstance) {
    notificationManagerInstance = new NotificationManager();
  }
  return notificationManagerInstance;
}
