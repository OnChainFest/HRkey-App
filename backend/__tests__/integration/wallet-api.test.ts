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
      .set('x-test-user-id', 'user-1')
      .set('x-test-user-email', 'user@example.com')
      .send({
        userId: 'user-1',
        email: 'user@example.com'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.wallet.address).toBe('0x52908400098527886E0F7030069857D2E4169EE7');
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
      .get('/api/wallet/user-1')
      .set('x-test-user-id', 'user-1')
      .set('x-test-user-email', 'user@example.com');

    expect(response.status).toBe(200);
    expect(response.body.wallet.address).toBe('0x0000000000000000000000000000000000000001');
  });
});
