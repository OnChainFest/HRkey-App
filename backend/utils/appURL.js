// backend/utils/appURL.js
// 🌐 Construcción universal del link de referencia sin riesgo de localhost

const PROD_URL = 'https://hrkey.xyz';

function getBaseURL() {
  const envUrl =
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL;

  if (envUrl && envUrl.startsWith('http')) return envUrl;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return PROD_URL; // fallback final y obligatorio
}

export function makeRefereeLink(inviteToken) {
  const base = getBaseURL();
  return `${base}/referee-evaluation-page.html?token=${encodeURIComponent(inviteToken)}`;
}

export const APP_URL = getBaseURL();
