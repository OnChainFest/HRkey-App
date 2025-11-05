// backend/utils/appUrl.js
export function makeRefereeLink(inviteToken) {
  const base =
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://hrkey.xyz'
      : 'http://localhost:3000');

  return `${base}/referee-evaluation-page.html?token=${inviteToken}`;
}
