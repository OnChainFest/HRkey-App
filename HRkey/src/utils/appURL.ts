/**
 * Utility function to generate a safe referee link without hardcoding localhost
 */
export function makeRefereeLink(token: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  return `${baseUrl}/ref/verify?token=${encodeURIComponent(token)}`;
}
