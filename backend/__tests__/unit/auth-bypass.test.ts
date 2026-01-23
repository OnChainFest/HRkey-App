import { jest } from '/globals';
import express from 'express';
import request from 'supertest';

import { requireAuth } from '../../middleware/auth.js';

describe('requireAuth test bypass', () => {
  const makeApp = () => {
    const app = express();
    app.get('/protected', requireAuth, (req, res) => {
      res.status(200).json({ userId: req.user?.id, email: req.user?.email });
    });
    return app;
  };

  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows bypass only when NODE_ENV=test and ALLOW_TEST_AUTH_BYPASS=true', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

    const response = await request(makeApp())
      .get('/protected')
      .set('x-test-user-id', 'user-123')
      .set('x-test-user-email', 'user@example.com');

    expect(response.status).toBe(200);
    expect(response.body.userId).toBe('user-123');
  });

  it('does not allow bypass when ALLOW_TEST_AUTH_BYPASS is not true', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_AUTH_BYPASS = 'false';

    const response = await request(makeApp())
      .get('/protected')
      .set('x-test-user-id', 'user-123')
      .set('x-test-user-email', 'user@example.com');

    expect(response.status).toBe(401);
  });

  it('does not allow bypass outside test environment', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

    const response = await request(makeApp())
      .get('/protected')
      .set('x-test-user-id', 'user-123')
      .set('x-test-user-email', 'user@example.com');

    expect(response.status).toBe(401);
  });
});
