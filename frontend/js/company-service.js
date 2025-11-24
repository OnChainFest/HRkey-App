// ============================================================================
// Company Service
// ============================================================================
// Client-side service for company and signer management
// Handles communication with company and signer endpoints
// ============================================================================

/**
 * Company Service Class
 * Manages companies and their authorized signers
 */
class CompanyService {
  constructor() {
    this.baseUrl = this.getBaseUrl();
  }

  /**
   * Get API base URL
   */
  getBaseUrl() {
    if (typeof API_BASE_URL !== 'undefined') {
      return API_BASE_URL;
    }
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
   * Create a new company
   *
   * @param {Object} params
   * @param {string} params.name - Company name
   * @param {string} [params.taxId] - Tax ID (RFC, EIN, etc.)
   * @param {string} [params.domainEmail] - Company email domain (e.g., '@company.com')
   * @param {string} [params.logoUrl] - Logo URL
   * @param {Object} [params.metadata] - Additional metadata
   * @returns {Promise<Object>} - Created company
   */
  async createCompany({ name, taxId, domainEmail, logoUrl, metadata }) {
    try {
      if (!name) {
        throw new Error('Company name is required');
      }

      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/company/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name,
          taxId: taxId || null,
          domainEmail: domainEmail || null,
          logoUrl: logoUrl || null,
          metadata: metadata || {}
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to create company');
      }

      return data;
    } catch (error) {
      console.error('Create company error:', error);
      throw error;
    }
  }

  /**
   * Get company by ID
   *
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} - Company details
   */
  async getCompany(companyId) {
    try {
      if (!companyId) {
        throw new Error('Company ID is required');
      }

      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/company/${companyId}`, {
        method: 'GET',
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to get company');
      }

      return data;
    } catch (error) {
      console.error('Get company error:', error);
      throw error;
    }
  }

  /**
   * Get all companies where current user is a signer
   *
   * @returns {Promise<Array>} - List of companies
   */
  async getMyCompanies() {
    try {
      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/companies/my`, {
        method: 'GET',
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to get companies');
      }

      return data.companies || [];
    } catch (error) {
      console.error('Get my companies error:', error);
      throw error;
    }
  }

  /**
   * Update company information
   *
   * @param {string} companyId - Company ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Updated company
   */
  async updateCompany(companyId, updates) {
    try {
      if (!companyId) {
        throw new Error('Company ID is required');
      }

      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/company/${companyId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to update company');
      }

      return data;
    } catch (error) {
      console.error('Update company error:', error);
      throw error;
    }
  }

  /**
   * Verify/unverify a company (Superadmin only)
   *
   * @param {string} companyId - Company ID
   * @param {boolean} verified - Verification status
   * @param {string} [notes] - Optional notes
   * @returns {Promise<Object>} - Updated company
   */
  async verifyCompany(companyId, verified, notes) {
    try {
      if (!companyId) {
        throw new Error('Company ID is required');
      }

      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/company/${companyId}/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          verified,
          notes: notes || ''
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to verify company');
      }

      return data;
    } catch (error) {
      console.error('Verify company error:', error);
      throw error;
    }
  }

  // ========== SIGNER MANAGEMENT ==========

  /**
   * Invite a new signer to the company
   *
   * @param {string} companyId - Company ID
   * @param {Object} params
   * @param {string} params.email - Signer email
   * @param {string} params.role - Signer role (e.g., 'HR Manager')
   * @returns {Promise<Object>} - Invitation result
   */
  async inviteSigner(companyId, { email, role }) {
    try {
      if (!companyId || !email || !role) {
        throw new Error('Company ID, email, and role are required');
      }

      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/company/${companyId}/signers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, role })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to invite signer');
      }

      return data;
    } catch (error) {
      console.error('Invite signer error:', error);
      throw error;
    }
  }

  /**
   * Get all signers for a company
   *
   * @param {string} companyId - Company ID
   * @returns {Promise<Array>} - List of signers
   */
  async getSigners(companyId) {
    try {
      if (!companyId) {
        throw new Error('Company ID is required');
      }

      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/company/${companyId}/signers`, {
        method: 'GET',
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to get signers');
      }

      return data.signers || [];
    } catch (error) {
      console.error('Get signers error:', error);
      throw error;
    }
  }

  /**
   * Update signer status or role
   *
   * @param {string} companyId - Company ID
   * @param {string} signerId - Signer ID
   * @param {Object} updates - Updates (isActive, role)
   * @returns {Promise<Object>} - Updated signer
   */
  async updateSigner(companyId, signerId, updates) {
    try {
      if (!companyId || !signerId) {
        throw new Error('Company ID and Signer ID are required');
      }

      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/company/${companyId}/signers/${signerId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to update signer');
      }

      return data;
    } catch (error) {
      console.error('Update signer error:', error);
      throw error;
    }
  }

  /**
   * Deactivate a signer
   *
   * @param {string} companyId - Company ID
   * @param {string} signerId - Signer ID
   * @returns {Promise<Object>} - Updated signer
   */
  async deactivateSigner(companyId, signerId) {
    return this.updateSigner(companyId, signerId, { isActive: false });
  }

  /**
   * Reactivate a signer
   *
   * @param {string} companyId - Company ID
   * @param {string} signerId - Signer ID
   * @returns {Promise<Object>} - Updated signer
   */
  async reactivateSigner(companyId, signerId) {
    return this.updateSigner(companyId, signerId, { isActive: true });
  }

  /**
   * Get invitation details by token (no auth required)
   *
   * @param {string} token - Invitation token
   * @returns {Promise<Object>} - Invitation details
   */
  async getInvitationByToken(token) {
    try {
      if (!token) {
        throw new Error('Invitation token is required');
      }

      const response = await fetch(`${this.baseUrl}/api/signers/invite/${token}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to get invitation');
      }

      return data;
    } catch (error) {
      console.error('Get invitation error:', error);
      throw error;
    }
  }

  /**
   * Accept a signer invitation
   *
   * @param {string} token - Invitation token
   * @returns {Promise<Object>} - Acceptance result
   */
  async acceptInvitation(token) {
    try {
      if (!token) {
        throw new Error('Invitation token is required');
      }

      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/signers/accept/${token}`, {
        method: 'POST',
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to accept invitation');
      }

      return data;
    } catch (error) {
      console.error('Accept invitation error:', error);
      throw error;
    }
  }

  // ========== AUDIT LOGS ==========

  /**
   * Get audit logs for a company
   *
   * @param {string} companyId - Company ID
   * @param {number} [limit=50] - Number of logs to fetch
   * @param {number} [offset=0] - Pagination offset
   * @returns {Promise<Array>} - Audit logs
   */
  async getAuditLogs(companyId, limit = 50, offset = 0) {
    try {
      const headers = await this.getAuthHeader();

      const url = new URL(`${this.baseUrl}/api/audit/logs`);
      if (companyId) url.searchParams.set('companyId', companyId);
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('offset', offset.toString());

      const response = await fetch(url, {
        method: 'GET',
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to get audit logs');
      }

      return data.logs || [];
    } catch (error) {
      console.error('Get audit logs error:', error);
      throw error;
    }
  }

  /**
   * Get recent activity for current user's companies
   *
   * @returns {Promise<Array>} - Recent activity
   */
  async getRecentActivity() {
    try {
      const headers = await this.getAuthHeader();

      const response = await fetch(`${this.baseUrl}/api/audit/recent`, {
        method: 'GET',
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to get recent activity');
      }

      return data.activity || [];
    } catch (error) {
      console.error('Get recent activity error:', error);
      throw error;
    }
  }
}

// Export singleton instance
const companyService = new CompanyService();

// Also export class for custom instances if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CompanyService, companyService };
}
