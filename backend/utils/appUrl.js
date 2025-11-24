/**
 * HRKey Backend - URL Utilities
 * ==============================
 *
 * Provides centralized URL configuration for frontend/backend communication.
 * Used for constructing referee links and other public-facing URLs.
 *
 * @module utils/appUrl
 */

/**
 * Get the public base URL for the frontend application.
 *
 * Priority order:
 * 1. FRONTEND_URL (primary - set by Vercel/Render env vars)
 * 2. PUBLIC_BASE_URL (alternative)
 * 3. APP_URL (legacy)
 * 4. VERCEL_URL (if deployed on Vercel)
 * 5. https://hrkey.xyz (production fallback)
 * 6. http://localhost:3000 (development fallback)
 *
 * @returns {string} The frontend base URL
 */
function getAppUrl() {
  // Check primary URL sources
  const frontendUrl = process.env.FRONTEND_URL;
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  const appUrl = process.env.APP_URL;
  const vercelUrl = process.env.VERCEL_URL;

  // Return first valid URL found
  if (frontendUrl && frontendUrl.trim()) {
    return frontendUrl.trim();
  }

  if (publicBaseUrl && publicBaseUrl.trim()) {
    return publicBaseUrl.trim();
  }

  if (appUrl && appUrl.trim()) {
    return appUrl.trim();
  }

  // Check Vercel deployment
  if (vercelUrl && vercelUrl.trim()) {
    return `https://${vercelUrl.trim()}`;
  }

  // Production fallback
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    return 'https://hrkey.xyz';
  }

  // Development fallback
  return 'http://localhost:3000';
}

/**
 * Construct a referee evaluation link with a token.
 *
 * @param {string} token - The invitation token
 * @returns {string} The full URL to the referee evaluation page
 *
 * @example
 * makeRefereeLink('abc123')
 * // => 'https://hrkey.vercel.app/referee-evaluation-page.html?ref=abc123'
 */
export function makeRefereeLink(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('makeRefereeLink requires a valid token string');
  }

  try {
    const baseUrl = getAppUrl();
    const url = new URL('/referee-evaluation-page.html', baseUrl);
    url.searchParams.set('ref', token);
    return url.toString();
  } catch (error) {
    // Fallback construction if URL parsing fails
    const baseUrl = getAppUrl();
    const separator = baseUrl.endsWith('/') ? '' : '/';
    return `${baseUrl}${separator}referee-evaluation-page.html?ref=${encodeURIComponent(token)}`;
  }
}

/**
 * The public app URL (frontend).
 * Cached constant for performance.
 */
export const APP_URL = getAppUrl();

/**
 * Export getAppUrl for testing/debugging purposes.
 */
export { getAppUrl };
