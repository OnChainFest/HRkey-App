/**
 * AI Reference Refinement Controller Tests
 * Tests for AI-powered editorial refinement of referee feedback
 *
 * Routes tested:
 * - POST /api/ai/reference/refine
 *
 * SECURITY: Requires authentication
 * VALIDATION: Uses Zod schema validation
 * RATE LIMITING: Uses strictLimiter
 */

import { jest } from '@jest/globals';
import request from 'supertest';

// Mock OpenAI before other imports
jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }))
}));

// Mock Supabase before importing server
jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}));

// Import mocks
const supabaseMock = await import('../__mocks__/supabase.mock.js');
const { createMockSupabaseClient, mockUserData } = supabaseMock.default;

// Create Supabase mock client
const mockSupabaseClient = createMockSupabaseClient();
const { createClient } = await import('@supabase/supabase-js');
createClient.mockReturnValue(mockSupabaseClient);

// Import OpenAI mock
const OpenAI = (await import('openai')).default;
let mockOpenAICreate;

process.env.RATE_LIMIT_ENABLED = 'false';

// Import app after mocks
const { default: app } = await import('../../server.js');

describe('AI Reference Refinement Controller', () => {
  const validAuthToken = 'valid-test-token-12345';
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalRateLimit = process.env.RATE_LIMIT_ENABLED;
  const mockUser = mockUserData({
    id: 'test-user-id',
    email: 'referee@example.com'
  });

  const validPayload = {
    experience: {
      role: 'Senior Software Engineer',
      company: 'Tech Corp',
      startDate: '2020-01-01',
      endDate: '2023-12-31',
      visibility: 'DEFAULT'
    },
    draft: 'John was a great developer. He worked hard and delivered results.'
  };

  const mockAIResponse = {
    refined: 'John demonstrated exceptional technical skills during his tenure as a Senior Software Engineer. He consistently delivered high-quality results and showed strong problem-solving abilities.',
    flags: [
      {
        type: 'LOW_SPECIFICITY',
        excerpt: 'worked hard',
        suggestion: 'Consider providing specific examples of projects or achievements.'
      }
    ]
  };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.RATE_LIMIT_ENABLED = 'false';
    jest.clearAllMocks();

    mockOpenAICreate = jest.fn();
    OpenAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: mockOpenAICreate
        }
      }
    }));

    // Mock auth
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    mockSupabaseClient.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockUser,
            error: null
          })
        })
      })
    });

    // Mock successful OpenAI response by default
    mockOpenAICreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(mockAIResponse)
          }
        }
      ]
    });
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
    process.env.RATE_LIMIT_ENABLED = originalRateLimit;
  });

  // ============================================================================
  // POST /api/ai/reference/refine - Validation Tests
  // ============================================================================

  describe('POST /api/ai/reference/refine - Validation', () => {
    test('AI-REFINE-1: Should reject missing draft field (400)', async () => {
      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send({
          experience: validPayload.experience
          // Missing draft
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('AI-REFINE-2: Should reject draft that is too short (400)', async () => {
      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send({
          experience: validPayload.experience,
          draft: 'Too short' // Less than 10 characters
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('AI-REFINE-3: Should reject missing experience fields (400)', async () => {
      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send({
          experience: {
            role: 'Engineer'
            // Missing company, startDate, endDate
          },
          draft: validPayload.draft
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('AI-REFINE-4: Should accept valid payload (200)', async () => {
      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(200);

      expect(response.body).toHaveProperty('refined');
      expect(response.body).toHaveProperty('flags');
    });

    test('AI-REFINE-5: Should accept visibility as optional with default', async () => {
      const payloadWithoutVisibility = {
        experience: {
          role: 'Engineer',
          company: 'Company Inc',
          startDate: '2020-01-01',
          endDate: '2023-12-31'
          // visibility is optional
        },
        draft: validPayload.draft
      };

      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(payloadWithoutVisibility)
        .expect(200);

      expect(response.body).toHaveProperty('refined');
    });
  });

  // ============================================================================
  // POST /api/ai/reference/refine - Authentication Tests
  // ============================================================================

  describe('POST /api/ai/reference/refine - Authentication', () => {
    test('AI-REFINE-6: Should reject missing auth token (401)', async () => {
      await request(app)
        .post('/api/ai/reference/refine')
        .send(validPayload)
        .expect(401);
    });

    test('AI-REFINE-7: Should reject invalid auth token (401)', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

      await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', 'Bearer invalid-token')
        .send(validPayload)
        .expect(401);
    });

    test('AI-REFINE-8: Should accept valid auth token (200)', async () => {
      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(200);

      expect(response.body).toHaveProperty('refined');
    });
  });

  // ============================================================================
  // POST /api/ai/reference/refine - OpenAI Integration Tests
  // ============================================================================

  describe('POST /api/ai/reference/refine - OpenAI Integration', () => {
    test('AI-REFINE-9: Should call OpenAI with correct parameters', async () => {
      await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(200);

      expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
      const callArgs = mockOpenAICreate.mock.calls[0][0];

      expect(callArgs).toHaveProperty('model');
      expect(callArgs).toHaveProperty('messages');
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[1].role).toBe('user');
      expect(callArgs.temperature).toBe(0.2);
      expect(callArgs.max_tokens).toBe(900);
      expect(callArgs.response_format).toEqual({ type: 'json_object' });
    });

    test('AI-REFINE-10: Should return refined text from OpenAI', async () => {
      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(200);

      expect(response.body.refined).toBe(mockAIResponse.refined);
      expect(response.body.flags).toEqual(mockAIResponse.flags);
    });

    test('AI-REFINE-11: Should handle empty flags array', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                refined: 'Refined text here',
                flags: []
              })
            }
          }
        ]
      });

      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(200);

      expect(response.body.flags).toEqual([]);
    });

    test('AI-REFINE-12: Should handle OpenAI API rate limit (429)', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      mockOpenAICreate.mockRejectedValue(rateLimitError);

      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(429);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Rate limit');
    });

    test('AI-REFINE-13: Should handle OpenAI API auth failure (503)', async () => {
      const authError = new Error('Invalid API key');
      authError.status = 401;
      mockOpenAICreate.mockRejectedValue(authError);

      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(503);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('configuration');
    });

    test('AI-REFINE-14: Should handle network errors gracefully (503)', async () => {
      const networkError = new Error('Network timeout');
      networkError.code = 'ETIMEDOUT';
      mockOpenAICreate.mockRejectedValue(networkError);

      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(503);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('unavailable');
    });

    test('AI-REFINE-15: Should handle invalid JSON response (502)', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'This is not valid JSON'
            }
          }
        ]
      });

      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(502);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('AI service error');
      expect(response.body).toHaveProperty('rawSnippet');
    });

    test('AI-REFINE-16: Should handle empty OpenAI response (502)', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: []
      });

      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(502);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('empty response');
    });

    test('AI-REFINE-17: Should handle malformed AI response structure (502)', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                // Missing 'refined' field
                flags: []
              })
            }
          }
        ]
      });

      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(502);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('malformed');
    });
  });

  // ============================================================================
  // POST /api/ai/reference/refine - Experience Context Tests
  // ============================================================================

  describe('POST /api/ai/reference/refine - Experience Context', () => {
    test('AI-REFINE-18: Should include experience context in user message', async () => {
      await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(200);

      const callArgs = mockOpenAICreate.mock.calls[0][0];
      const userMessage = callArgs.messages[1].content;

      expect(userMessage).toContain('Senior Software Engineer');
      expect(userMessage).toContain('Tech Corp');
      expect(userMessage).toContain('2020-01-01');
      expect(userMessage).toContain('2023-12-31');
      expect(userMessage).toContain('DEFAULT');
    });

    test('AI-REFINE-19: Should include draft in user message', async () => {
      await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(200);

      const callArgs = mockOpenAICreate.mock.calls[0][0];
      const userMessage = callArgs.messages[1].content;

      expect(userMessage).toContain(validPayload.draft);
    });

    test('AI-REFINE-20: Should handle different visibility levels', async () => {
      const payloadWithVisibility = {
        ...validPayload,
        experience: {
          ...validPayload.experience,
          visibility: 'CANDIDATE_ONLY'
        }
      };

      await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(payloadWithVisibility)
        .expect(200);

      const callArgs = mockOpenAICreate.mock.calls[0][0];
      const userMessage = callArgs.messages[1].content;

      expect(userMessage).toContain('CANDIDATE_ONLY');
    });
  });

  // ============================================================================
  // Security & Safety Tests
  // ============================================================================

  describe('POST /api/ai/reference/refine - Security', () => {
    test('AI-REFINE-21: Should not expose OpenAI API key in responses', async () => {
      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(200);

      const responseString = JSON.stringify(response.body);
      expect(responseString).not.toContain('sk-');
      expect(responseString).not.toContain('OPENAI_API_KEY');
    });

    test('AI-REFINE-22: Should not expose user details in logs or responses', async () => {
      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(200);

      expect(response.body).not.toHaveProperty('userId');
      expect(response.body).not.toHaveProperty('user');
      expect(response.body).not.toHaveProperty('authToken');
    });

    test('AI-REFINE-23: Should sanitize error messages', async () => {
      const error = new Error('OpenAI error with API key sk-1234567890');
      mockOpenAICreate.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/ai/reference/refine')
        .set('Authorization', `Bearer ${validAuthToken}`)
        .send(validPayload)
        .expect(500);

      expect(response.body.message).not.toContain('sk-');
    });
  });
});
