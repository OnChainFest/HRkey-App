/**
 * EmailJS Integration for HRKey
 *
 * Setup:
 * 1. Create account at https://www.emailjs.com/
 * 2. Create email service (Gmail, Outlook, etc)
 * 3. Create email templates
 * 4. Get your credentials from EmailJS dashboard
 */

import emailjs from '@emailjs/browser';

// Initialize EmailJS with your public key
// This should be called once when the app loads
export function initEmailJS() {
  const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

  if (!publicKey) {
    console.warn('EmailJS public key not found. Email functionality will be disabled.');
    return false;
  }

  emailjs.init(publicKey);
  return true;
}

// Template parameters interface
interface ReferenceInviteParams {
  to_email: string;
  to_name: string;
  from_name?: string;
  verification_link: string;
  applicant_position?: string;
  applicant_company?: string;
  expires_in_days?: number;
}

interface ReferenceCompletedParams {
  to_email: string;
  to_name: string;
  referrer_name: string;
  overall_rating: number;
  dashboard_link: string;
}

/**
 * Send reference invitation email
 *
 * Template variables needed in EmailJS dashboard:
 * - {{to_name}} - Recipient name
 * - {{from_name}} - Sender name
 * - {{verification_link}} - Link to complete reference
 * - {{applicant_position}} - Position applied for
 * - {{applicant_company}} - Company name
 * - {{expires_in_days}} - Days until expiration
 */
export async function sendReferenceInvite(params: ReferenceInviteParams) {
  const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_INVITE;

  if (!serviceId || !templateId) {
    console.error('EmailJS not configured. Missing service ID or template ID.');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const response = await emailjs.send(
      serviceId,
      templateId,
      {
        to_email: params.to_email,
        to_name: params.to_name || 'there',
        from_name: params.from_name || 'HRKey',
        verification_link: params.verification_link,
        applicant_position: params.applicant_position || 'a position',
        applicant_company: params.applicant_company || 'a company',
        expires_in_days: params.expires_in_days || 30,
      }
    );

    console.log('✅ Email sent successfully:', response);
    return { success: true, response };
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    return { success: false, error };
  }
}

/**
 * Send reference completed notification
 *
 * Template variables needed:
 * - {{to_name}} - User name
 * - {{referrer_name}} - Who completed the reference
 * - {{overall_rating}} - Rating (1-5)
 * - {{dashboard_link}} - Link to dashboard
 */
export async function sendReferenceCompleted(params: ReferenceCompletedParams) {
  const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_COMPLETED;

  if (!serviceId || !templateId) {
    console.error('EmailJS not configured. Missing service ID or template ID.');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const response = await emailjs.send(
      serviceId,
      templateId,
      {
        to_email: params.to_email,
        to_name: params.to_name,
        referrer_name: params.referrer_name,
        overall_rating: params.overall_rating,
        dashboard_link: params.dashboard_link,
      }
    );

    console.log('✅ Notification sent successfully:', response);
    return { success: true, response };
  } catch (error) {
    console.error('❌ Failed to send notification:', error);
    return { success: false, error };
  }
}

/**
 * Send email from server-side (API Routes)
 * Uses fetch API to call EmailJS REST API
 */
export async function sendEmailFromServer(params: {
  serviceId: string;
  templateId: string;
  templateParams: Record<string, unknown>;
  publicKey: string;
}) {
  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: params.serviceId,
        template_id: params.templateId,
        user_id: params.publicKey,
        template_params: params.templateParams,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`EmailJS API error: ${error}`);
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send email from server:', error);
    return { success: false, error };
  }
}
