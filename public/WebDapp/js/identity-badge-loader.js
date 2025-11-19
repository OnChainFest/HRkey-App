// ============================================================================
// Identity Badge Loader
// ============================================================================
// Loads and displays identity verification badge on app.html
// Also checks if user is a company signer and shows company dashboard link
// ============================================================================

(async function() {
  'use strict';

  // Wait for DOM to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    try {
      // Wait for Supabase client to be available
      await waitForSupabase();

      // Get current session
      const { data: { session } } = await supabaseClient.auth.getSession();

      if (!session || !session.user) {
        return; // Not logged in
      }

      const userId = session.user.id;

      // Load identity verification status
      await loadIdentityStatus(userId);

      // Check if user is a company signer
      await checkCompanyAccess(userId);
    } catch (error) {
      console.error('Identity badge loader error:', error);
    }
  }

  async function waitForSupabase(maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      if (typeof supabaseClient !== 'undefined') {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error('Supabase client not found');
  }

  async function loadIdentityStatus(userId) {
    try {
      const badgeContainer = document.getElementById('identityBadge');
      if (!badgeContainer) return;

      // Fetch user data from Supabase
      const { data: user, error } = await supabaseClient
        .from('users')
        .select('identity_verified')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user data:', error);
        return;
      }

      // Display badge or button
      if (user && user.identity_verified) {
        badgeContainer.innerHTML = `
          <span class="verified-badge" title="Identity verified">
            ✓ Verified
          </span>
        `;
      } else {
        badgeContainer.innerHTML = `
          <a href="/WebDapp/identity_verification.html" class="btn-verify-identity" title="Verify your identity">
            Verify Identity
          </a>
        `;
      }
    } catch (error) {
      console.error('Error loading identity status:', error);
    }
  }

  async function checkCompanyAccess(userId) {
    try {
      const companyLink = document.getElementById('companyDashboardLink');
      if (!companyLink) return;

      // Check if user is an active signer of any company
      const { data: signers, error } = await supabaseClient
        .from('company_signers')
        .select('id, company_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1);

      if (error) {
        console.error('Error checking company access:', error);
        return;
      }

      if (signers && signers.length > 0) {
        // User is a signer - show company dashboard link
        companyLink.style.display = 'inline-block';

        // Update href to include company ID
        companyLink.href = `/WebDapp/company_dashboard.html?companyId=${signers[0].company_id}`;
      }
    } catch (error) {
      console.error('Error checking company access:', error);
    }
  }
})();
