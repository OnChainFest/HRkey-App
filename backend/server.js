import { app, ensureSuperadmin, BACKEND_PUBLIC_URL, APP_URL, STRIPE_SECRET_KEY, PORT } from './app.js';
import logger from './logger.js';

app.listen(PORT, async () => {
  logger.info('HRKey Backend started', {
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    healthEndpoint: new URL('/health', BACKEND_PUBLIC_URL).toString(),
    frontendUrl: APP_URL,
    stripeMode: STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 'TEST'
  });

  await ensureSuperadmin();
});
