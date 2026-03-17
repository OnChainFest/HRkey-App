/**
 * Payment Intent Tests
 * Tests for Stripe payment intent creation endpoint
 *
 * Route: POST /create-payment-intent
 * SECURITY: This endpoint requires authentication
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import {
  createMockSupabaseClient,
  resetQueryBuilderMocks,
  mockAuthGetUserSuccess,
  mockDatabaseSuccess,
  mockUserData
} from '../__mocks__/supabase.mock.js';
import {
  createMockStripeClient,
  mockPaymentIntentSuccess,
  mockPaymentIntentError,
  resetStripeMocks
} from '../__mocks__/stripe.mock.js';

const mockSupabaseClient = createMockSupabaseClient();
const mockQueryBuilder = mockSupabaseClient.from();
const mockCreateClient = jest.fn(() => mockSupabaseClient);

// Mock Supabase for authentication
jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: mockCreateClient
}));

// Mock Stripe
jest.unstable_mockModule('stripe', () => ({
  default: jest.fn()
}));

const stripeMocks = createMockStripeClient();
const { default: Stripe } = await import('stripe');
Stripe.mockImplementation(() => stripeMocks.mockStripe);

// Import app after all mocks are set up
const { default: app } = await import('../../server.js');

describe('Payment Intent Creation - POST /create-payment-intent', () => {
  const validToken = 'valid-jwt-token-12345';
  const userId = '550e8400-e29b-41d4-a716-446655440000';

  function configureUsersTable(user) {
    const usersTable = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(mockDatabaseSuccess(user))
    };

    mockSupabaseClient.from.mockImplementation((table) => {
      if (table === 'users') return usersTable;
      return mockQueryBuilder;
    });

    return usersTable;
  }

  // Helper function to set up authentication mocks
  function setupAuth(overrides = {}) {
    const user = mockUserData({
      id: userId,
      email: 'test@example.com',
      role: 'user',
      ...overrides
    });

    mockSupabaseClient.auth.getUser.mockResolvedValue(
      mockAuthGetUserSuccess(user.id, user.email)
    );

    configureUsersTable(user);

    return user;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    mockCreateClient.mockImplementation(() => mockSupabaseClient);

    mockSupabaseClient.auth.getUser = jest.fn().mockResolvedValue({
      data: { user: null },
      error: new Error('No auth token provided')
    });

    mockSupabaseClient.from.mockReturnValue(mockQueryBuilder);
    resetQueryBuilderMocks(mockQueryBuilder);
    resetStripeMocks(stripeMocks);
  });

  // ============================================================================
  // SECURITY TESTS
  // ============================================================================

  describe('Security & Authentication', () => {
    test('SECURITY-PI1: Should require authentication (reject unauthenticated requests)', async () => {
      const response = await request(app)
        .post('/create-payment-intent')
        .send({
          amount: 10000,
          email: 'test@example.com'
        })
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('SECURITY-PI2: Should reject invalid authentication token', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

      const response = await request(app)
        .post('/create-payment-intent')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          amount: 10000,
          email: 'test@example.com'
        })
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
    });

    test('SECURITY-PI3: Should use authenticated user email if not provided', async () => {
      const user = setupAuth({
        email: 'authenticated@example.com'
      });

      stripeMocks.mockPaymentIntentsCreate.mockResolvedValue(
        mockPaymentIntentSuccess()
      );

      await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 10000
        })
        .expect(200);

      expect(stripeMocks.mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          receipt_email: user.email
        })
      );
    });
  });

  // ============================================================================
  // VALIDATION TESTS
  // ============================================================================

  describe('Input Validation (Zod Schema)', () => {
    test.skip('VALID-PI1: Should reject amount below minimum (< 50 cents)', async () => {
      setupAuth();

      const response = await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 25,
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    test.skip('VALID-PI2: Should reject amount above maximum (> 1,000,000 cents)', async () => {
      setupAuth();

      const response = await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 1000001,
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    test.skip('VALID-PI3: Should reject non-integer amount', async () => {
      setupAuth();

      const response = await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 100.5,
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    test.skip('VALID-PI4: Should reject invalid email format', async () => {
      setupAuth();

      const response = await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 10000,
          email: 'not-an-email'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    test('VALID-PI5: Should accept valid amount without email', async () => {
      setupAuth();

      stripeMocks.mockPaymentIntentsCreate.mockResolvedValue(
        mockPaymentIntentSuccess({ receipt_email: 'test@example.com' })
      );

      const response = await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 10000
        })
        .expect(200);

      expect(response.body.clientSecret).toBeDefined();
      expect(stripeMocks.mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 10000,
          receipt_email: 'test@example.com'
        })
      );
    });
  });

  // ============================================================================
  // HAPPY PATH TESTS
  // ============================================================================

  describe('Successful Payment Intent Creation', () => {
    test('HAPPY-PI1: Should create payment intent successfully', async () => {
      setupAuth();

      const mockPaymentIntent = mockPaymentIntentSuccess({
        amount: 15000,
        receipt_email: 'buyer@example.com',
        metadata: {
          promoCode: 'LAUNCH2024',
          plan: 'pro-lifetime'
        }
      });

      stripeMocks.mockPaymentIntentsCreate.mockResolvedValue(mockPaymentIntent);

      const response = await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 15000,
          email: 'buyer@example.com',
          promoCode: 'LAUNCH2024'
        })
        .expect(200);

      expect(response.body).toEqual({
        clientSecret: mockPaymentIntent.client_secret,
        paymentIntentId: mockPaymentIntent.id
      });
    });

    test('HAPPY-PI2: Should include correct metadata in payment intent', async () => {
      setupAuth();

      stripeMocks.mockPaymentIntentsCreate.mockResolvedValue(
        mockPaymentIntentSuccess()
      );

      await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 10000,
          email: 'test@example.com',
          promoCode: 'EARLYBIRD'
        })
        .expect(200);

      expect(stripeMocks.mockPaymentIntentsCreate).toHaveBeenCalledWith({
        amount: 10000,
        currency: 'usd',
        receipt_email: 'test@example.com',
        metadata: {
          promoCode: 'EARLYBIRD',
          plan: 'pro-lifetime'
        },
        description: 'HRKey PRO - Lifetime Access'
      });
    });

    test('HAPPY-PI3: Should use "none" as default promo code if not provided', async () => {
      setupAuth();

      stripeMocks.mockPaymentIntentsCreate.mockResolvedValue(
        mockPaymentIntentSuccess()
      );

      await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 10000,
          email: 'test@example.com'
        })
        .expect(200);

      expect(stripeMocks.mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            promoCode: 'none',
            plan: 'pro-lifetime'
          }
        })
      );
    });

    test('HAPPY-PI4: Should return client secret for payment completion', async () => {
      setupAuth();

      const mockPaymentIntent = mockPaymentIntentSuccess({
        client_secret: 'pi_special_secret_xyz123',
        id: 'pi_special_xyz'
      });

      stripeMocks.mockPaymentIntentsCreate.mockResolvedValue(mockPaymentIntent);

      const response = await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 10000,
          email: 'test@example.com'
        })
        .expect(200);

      expect(response.body.clientSecret).toBe('pi_special_secret_xyz123');
      expect(response.body.paymentIntentId).toBe('pi_special_xyz');
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Stripe SDK Error Handling', () => {
    test('ERROR-PI1: Should handle Stripe card declined error', async () => {
      setupAuth();

      const stripeError = mockPaymentIntentError('Your card was declined');
      stripeMocks.mockPaymentIntentsCreate.mockRejectedValue(stripeError);

      const response = await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 10000,
          email: 'test@example.com'
        })
        .expect(500);

      expect(response.body.error).toBe('Your card was declined');
    });

    test('ERROR-PI2: Should handle Stripe API connection error', async () => {
      setupAuth();

      const connectionError = new Error('Network error: unable to connect to Stripe');
      stripeMocks.mockPaymentIntentsCreate.mockRejectedValue(connectionError);

      const response = await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 10000,
          email: 'test@example.com'
        })
        .expect(500);

      expect(response.body.error).toBe('Network error: unable to connect to Stripe');
    });

    test('ERROR-PI3: Should handle missing Stripe API key', async () => {
      setupAuth();

      const authError = new Error('Invalid API Key provided');
      stripeMocks.mockPaymentIntentsCreate.mockRejectedValue(authError);

      const response = await request(app)
        .post('/create-payment-intent')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 10000,
          email: 'test@example.com'
        })
        .expect(500);

      expect(response.body.error).toBe('Invalid API Key provided');
    });
  });
});