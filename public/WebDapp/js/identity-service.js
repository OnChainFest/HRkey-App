// ============================================================================
// Identity Service
// ============================================================================
// Client-side service for identity verification operations
// Handles communication with identity endpoints
// ============================================================================

/**
 * Identity Service Class
 * Manages user identity verification
 */
class IdentityService {
  constructor() {
    this.baseUrl = this.getBaseUrl();
  }

  /**
   * Get API base URL
   */
  getBaseUrl() {
    // Try to get from environment or use default
    if (typeof API_BASE_URL !== 'undefined') {
      return API_BASE_URL;
    }
    // Fallback to production or local
    return window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : 'https://hrkey.xyz';
  }

  /**
   * Get authorization header from Supabase session
   */
  async getAuthHeader() {
    if (typeof supabaseClient === 'undefined') {
      throw new Error('Supabase client not initialized');
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
      throw new Error('No active session. Please log in.');
    }

    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Verify user's identity
   *
   * @param {Object} params
   * @param {string} params.userId - User ID
   * @param {string} params.fullName - Full name
   * @param {string} params.idNumber - ID number (passport, driver's license, etc.)
   * @param {string} [params.selfieUrl] - Optional selfie URL
   * @returns {Promise<Object>} - Verification result
   */
  async verifyIdentity({ userId, fullName, idNumber, selfieUrl }) {
    try {
      if (!userId || !fullName || !idNumber) {
        throw new Error('Missing required fields: userId, fullName, or idNumber');
      }

      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/identity/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId,
          fullName,
          idNumber,
          selfieUrl: selfieUrl || null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to verify identity');
      }

      return data;
    } catch (error) {
      console.error('Identity verification error:', error);
      throw error;
    }
  }

  /**
   * Get verification status for a user
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Verification status
   */
  async getVerificationStatus(userId) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/identity/status/${userId}`, {
        method: 'GET',
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to get verification status');
      }

      return data;
    } catch (error) {
      console.error('Get verification status error:', error);
      throw error;
    }
  }

  /**
   * Check if current user is verified
   *
   * @returns {Promise<boolean>} - True if verified
   */
  async isCurrentUserVerified() {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();

      if (!user) {
        return false;
      }

      const status = await this.getVerificationStatus(user.id);
      return status.verified === true;
    } catch (error) {
      console.error('Error checking verification:', error);
      return false;
    }
  }
}

// Export singleton instance
const identityService = new IdentityService();

// Also export class for custom instances if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { IdentityService, identityService };
}
