import { jest } from "@jest/globals";
import request from 'supertest';
import { createSupabaseMock, mockSuccess } from '../utils/supabase-mock';

const { supabase, setTableResponses } = createSupabaseMock();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabase)
}));

jest.mock('ethers', () => ({
  ethers: {
    Wallet: {
      createRandom: jest.fn(() => ({
        address: '0x52908400098527886E0F7030069857D2E4169EE7',
        privateKey: '0xprivkey'
      }))
    }
  }
}));

const { app } = await import('../../app.js');

describe('Wallet API', () => {
  it('creates a wallet for the authenticated user', async () => {
    setTableResponses('user_wallets', {
      maybeSingleResponses: [mockSuccess(null)],
      singleResponses: [
        mockSuccess({
          address: '0x52908400098527886E0F7030069857D2E4169EE7',
          network: 'base-mainnet',
          wallet_type: 'custodial',
          created_at: '2024-01-01T00:00:00.000Z'
        })
      ]
    });

    setTableResponses('user_plans', {
      insertResponses: [mockSuccess(null)]
    });

    const response = await request(app)
      .post('/api/wallet/create')
      .set('x-test-user-id', '00000000-0000-4000-8000-000000000001')
      .set('x-test-user-email', 'user@example.com')
      .set('x-test-user-role', 'user')
      .send({
        userId: '00000000-0000-4000-8000-000000000001',
        email: 'user@example.com'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('returns the user wallet', async () => {
    setTableResponses('user_wallets', {
      singleResponses: [
        mockSuccess({
          address: '0x0000000000000000000000000000000000000001',
          network: 'base-mainnet',
          wallet_type: 'custodial',
          created_at: '2024-01-02T00:00:00.000Z'
        })
      ]
    });

    const response = await request(app)
      .get('/api/wallet/00000000-0000-4000-8000-000000000001')
      .set('x-test-user-id', '00000000-0000-4000-8000-000000000001')
      .set('x-test-user-email', 'user@example.com').set('x-test-user-role', 'user')
      ;

    expect(response.status).toBe(200);
    expect(response.body.wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('returns 404 when accessing another user wallet', async () => {
    const response = await request(app)
      .get('/api/wallet/00000000-0000-4000-8000-000000000002')
      .set('x-test-user-id', '00000000-0000-4000-8000-000000000001')
      .set('x-test-user-email', 'user@example.com').set('x-test-user-role', 'user')
      ;

    expect(response.status).toBe(404);
  });

  it('allows superadmin to access another user wallet', async () => {
    setTableResponses('user_wallets', {
      singleResponses: [
        mockSuccess({
          address: '0x0000000000000000000000000000000000000002',
          network: 'base-mainnet',
          wallet_type: 'custodial',
          created_at: '2024-01-03T00:00:00.000Z'
        })
      ]
    });

    const response = await request(app)
      .get('/api/wallet/00000000-0000-4000-8000-000000000002')
      .set('x-test-user-id', '8b7b6f8e-5c2a-4b6a-9b2e-1f1d4a6c9a99')
      .set('x-test-user-email', 'admin@example.com')
      .set('x-test-user-role', 'superadmin');

    expect(response.status).toBe(200);
    expect(response.body.wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
