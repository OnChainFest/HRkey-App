/**
 * Utility function to generate a safe referee link without hardcoding localhost
 */
export function makeRefereeLink(token: string): string {
  // Get the base URL from environment variable, fallback to a default
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ||
                  process.env.NEXT_PUBLIC_APP_URL ||
                  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
                  'http://localhost:3000';

  // Updated to match the actual verify page path
  return `${baseUrl}/ref/verify?token=${encodeURIComponent(token)}`;
}
