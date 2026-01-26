import { jest } from "@jest/globals";
import request from 'supertest';
import { createSupabaseMock, mockSuccess } from '../utils/supabase-mock';

const { supabase, setTableResponses } = createSupabaseMock();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabase)
}));

const { app } = await import('../../app.js');

describe('References API', () => {
  it('returns a generic response when candidate is not found', async () => {
    setTableResponses('users', {
      singleResponses: [mockSuccess(null)]
    });

    setTableResponses('user_wallets', {
      singleResponses: [mockSuccess(null)]
    });

    const response = await request(app)
      .post('/api/references/request')
      .set('x-test-user-id', 'user-1')
      .set('x-test-user-email', 'user@example.com')
      .send({
        candidate_wallet: '0x123456',
        referee_email: 'referee@example.com'
      });

    expect(response.status).toBe(202);
    expect(response.body.ok).toBe(true);
  });
});
