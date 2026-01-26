import { jest } from "@jest/globals";
import { createSupabaseMock, mockSuccess } from '../utils/supabase-mock';

const { supabase, setTableResponses } = createSupabaseMock();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabase)
}));

const { ReferenceService } = await import('../../services/references.service.js');

describe('ReferenceService.submitReference', () => {
  it('returns a conflict when the invite is already being processed', async () => {
    setTableResponses('reference_invites', {
      updateResponses: [mockSuccess([])]
    });

    await expect(
      ReferenceService.submitReference({
        token: 'token',
        invite: {
          id: 'invite-1',
          status: 'pending',
          requester_id: 'user-1',
          referee_name: 'Referee',
          referee_email: 'referee@example.com',
          metadata: {}
        },
        ratings: {},
        comments: {}
      })
    ).rejects.toMatchObject({ status: 409 });
  });
});
