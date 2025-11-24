/**
 * HRKey Frontend - API Configuration
 *
 * Configures dynamic API base URL based on environment.
 * Works in both local development and production (Vercel).
 *
 * Usage in other JS files:
 *
 * <script src="js/api-config.js"></script>
 * <script>
 *   fetch(`${API_BASE_URL}/api/hrkey-score`, { ... })
 * </script>
 */

// Dynamic API Base URL
// Priority:
// 1. window.API_BASE_URL (set via Vercel env)
// 2. VITE_API_BASE_URL (if using Vite)
// 3. Production URL (Render)
// 4. Local development fallback

const API_BASE_URL =
  window.API_BASE_URL ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  'https://hrkey-backend.onrender.com';

// Export for ES modules
if (typeof window !== 'undefined') {
  window.API_BASE_URL = API_BASE_URL;
}

// Log configuration (only in development)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  console.log('🔧 API Configuration:', {
    API_BASE_URL,
    frontend: window.location.origin
  });
}

// Helper function to make API calls with proper error handling
window.fetchAPI = async function(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include', // Include cookies for auth
    ...options
  };

  try {
    const response = await fetch(url, defaultOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ API Error:', error);
    throw error;
  }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API_BASE_URL, fetchAPI: window.fetchAPI };
}
