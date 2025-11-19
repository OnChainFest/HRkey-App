// ============================================================================
// Email Service (Resend Integration)
// ============================================================================
// Centralized email sending service using Resend API
// Handles signer invitations, identity verification, and company notifications
// ============================================================================

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const SENDER_EMAIL = 'HRKey <noreply@hrkey.xyz>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

/**
 * Generate HTML for signer invitation email
 */
function generateSignerInvitationHTML({ recipientName, companyName, role, inviteUrl, inviterName }) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Join ${companyName} on HRKey</title>
      </head>
      <body style="font-family: 'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f4f4f4; margin: 0; padding: 0;">
        <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header with gradient -->
          <div style="background: linear-gradient(135deg, #000000 0%, #00C4C7 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">HRKey</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Professional Reputation Platform</p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 24px;">You've Been Invited!</h2>

            <p style="color: #4a4a4a; line-height: 1.6; margin: 0 0 15px 0;">
              Hi ${recipientName || 'there'},
            </p>

            <p style="color: #4a4a4a; line-height: 1.6; margin: 0 0 15px 0;">
              ${inviterName || 'Someone'} has invited you to join <strong>${companyName}</strong> on HRKey as a <strong>${role}</strong>.
            </p>

            <p style="color: #4a4a4a; line-height: 1.6; margin: 0 0 25px 0;">
              As an authorized signer, you'll be able to verify and manage professional references on behalf of your organization.
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #000000 0%, #00C4C7 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Accept Invitation
              </a>
            </div>

            <p style="color: #999; font-size: 14px; line-height: 1.6; margin: 25px 0 0 0; padding-top: 20px; border-top: 1px solid #eee;">
              Or copy and paste this URL into your browser:<br>
              <a href="${inviteUrl}" style="color: #00C4C7; word-break: break-all;">${inviteUrl}</a>
            </p>
          </div>

          <!-- Footer -->
          <div style="background: #f8f8f8; padding: 20px 30px; text-align: center; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              This invitation was sent by HRKey on behalf of ${companyName}.<br>
              If you weren't expecting this invitation, you can safely ignore this email.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generate plain text version of signer invitation
 */
function generateSignerInvitationText({ recipientName, companyName, role, inviteUrl, inviterName }) {
  return `
You've been invited to join ${companyName} on HRKey!

Hi ${recipientName || 'there'},

${inviterName || 'Someone'} has invited you to join ${companyName} on HRKey as a ${role}.

As an authorized signer, you'll be able to verify and manage professional references on behalf of your organization.

Accept your invitation by clicking this link:
${inviteUrl}

If you weren't expecting this invitation, you can safely ignore this email.

---
HRKey - Professional Reputation Platform
  `.trim();
}

// ============================================================================
// EMAIL SENDING FUNCTIONS
// ============================================================================

/**
 * Send signer invitation email
 *
 * @param {Object} params
 * @param {string} params.recipientEmail - Email address of invitee
 * @param {string} params.recipientName - Name of invitee (optional)
 * @param {string} params.companyName - Name of company
 * @param {string} params.role - Role being assigned (e.g., 'HR Manager')
 * @param {string} params.inviteToken - Unique invitation token
 * @param {string} params.inviterName - Name of person sending invitation (optional)
 * @returns {Promise<Object>} - Resend API response
 */
export async function sendSignerInvitation({
  recipientEmail,
  recipientName,
  companyName,
  role,
  inviteToken,
  inviterName
}) {
  try {
    if (!recipientEmail || !companyName || !role || !inviteToken) {
      throw new Error('Missing required parameters for signer invitation');
    }

    const inviteUrl = `${FRONTEND_URL}/WebDapp/company_invite.html?token=${inviteToken}`;

    const htmlContent = generateSignerInvitationHTML({
      recipientName,
      companyName,
      role,
      inviteUrl,
      inviterName
    });

    const textContent = generateSignerInvitationText({
      recipientName,
      companyName,
      role,
      inviteUrl,
      inviterName
    });

    const { data, error } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: recipientEmail,
      subject: `You've been invited to join ${companyName} on HRKey`,
      html: htmlContent,
      text: textContent
    });

    if (error) {
      console.error('Resend API error:', error);
      throw new Error(`Failed to send invitation email: ${error.message}`);
    }

    console.log(`✅ Signer invitation sent to ${recipientEmail}`);
    return data;
  } catch (error) {
    console.error('Error sending signer invitation:', error);
    throw error;
  }
}

/**
 * Send identity verification confirmation email
 * (for future use when identity is verified)
 *
 * @param {Object} params
 * @param {string} params.recipientEmail
 * @param {string} params.recipientName
 * @returns {Promise<Object>}
 */
export async function sendIdentityVerificationConfirmation({
  recipientEmail,
  recipientName
}) {
  try {
    const { data, error } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: recipientEmail,
      subject: 'Your HRKey identity has been verified',
      html: `
        <h2>Identity Verified ✓</h2>
        <p>Hi ${recipientName},</p>
        <p>Your identity has been successfully verified on HRKey.</p>
        <p>You can now:</p>
        <ul>
          <li>Request verified references</li>
          <li>Publish references to the blockchain</li>
          <li>Access premium features</li>
        </ul>
        <p>Thank you for using HRKey!</p>
      `,
      text: `Your HRKey identity has been verified. You now have access to premium features.`
    });

    if (error) {
      throw new Error(`Failed to send verification email: ${error.message}`);
    }

    console.log(`✅ Verification confirmation sent to ${recipientEmail}`);
    return data;
  } catch (error) {
    console.error('Error sending verification confirmation:', error);
    throw error;
  }
}

/**
 * Send company verification notification
 * (notify company admin when company is verified by superadmin)
 *
 * @param {Object} params
 * @param {string} params.recipientEmail
 * @param {string} params.companyName
 * @returns {Promise<Object>}
 */
export async function sendCompanyVerificationNotification({
  recipientEmail,
  companyName
}) {
  try {
    const { data, error } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: recipientEmail,
      subject: `${companyName} has been verified on HRKey`,
      html: `
        <h2>Company Verified ✓</h2>
        <p>Great news!</p>
        <p><strong>${companyName}</strong> has been verified on HRKey.</p>
        <p>You can now:</p>
        <ul>
          <li>Add authorized signers</li>
          <li>Verify employee references</li>
          <li>Access company dashboard</li>
        </ul>
        <p><a href="${FRONTEND_URL}/WebDapp/company_dashboard.html">Go to Company Dashboard</a></p>
      `,
      text: `${companyName} has been verified on HRKey. You can now add signers and manage references.`
    });

    if (error) {
      throw new Error(`Failed to send company verification email: ${error.message}`);
    }

    console.log(`✅ Company verification notification sent to ${recipientEmail}`);
    return data;
  } catch (error) {
    console.error('Error sending company verification notification:', error);
    throw error;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  sendSignerInvitation,
  sendIdentityVerificationConfirmation,
  sendCompanyVerificationNotification
};
