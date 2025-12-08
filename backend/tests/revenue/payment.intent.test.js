/**
 * Payment Intent Tests
 * Tests for Stripe payment intent creation endpoint
 *
 * Route: POST /create-payment-intent
 * Controller: Inline in server.js (lines 645-668)
 *
 * SECURITY NOTE: This endpoint currently has NO authentication requirement.
 * This is a potential security concern that should be addressed.
 */

import { jest } from '@jest/globals';
import request from 'supertest';

// Mock Stripe before importing server
jest.unstable_mockModule('stripe', () => ({
  default: jest.fn()
}));

// Import mocks
const {
  createMockStripeClient,
  mockPaymentIntentSuccess,
  mockPaymentIntentError,
  resetStripeMocks
} = await import('../__mocks__/stripe.mock.js');

// Create Stripe mocks
const stripeMocks = createMockStripeClient();

// Mock the Stripe constructor to return our mock client
const { default: Stripe } = await import('stripe');
Stripe.mockImplementation(() => stripeMocks.mockStripe);

// Import app after all mocks are set up
const { default: app } = await import('../../server.js');

describe('Payment Intent Creation - POST /create-payment-intent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStripeMocks(stripeMocks);
  });

  // ============================================================================
  // SECURITY TESTS
  // ============================================================================

  describe('Security & Authentication', () => {
    test('SECURITY-PI1: Should allow unauthenticated requests (DOCUMENT AS SECURITY CONCERN)', async () => {
      stripeMocks.mockPaymentIntentsCreate.mockResolvedValue(
        mockPaymentIntentSuccess()
      );

      const response = await request(app)
        .post('/create-payment-intent')
        .send({
          amount: 10000,
          email: 'test@example.com',
          promoCode: 'TEST'
        });

      // SECURITY ISSUE: This endpoint does NOT require authentication
      // Anyone can create payment intents without being logged in
      // This should be reviewed and potentially require requireAuth middleware
      expect(response.status).not.toBe(401);
      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // VALIDATION TESTS
  // ============================================================================

  describe('Input Validation (Zod Schema)', () => {
    test('VALID-PI1: Should reject amount below minimum (< 50 cents)', async () => {
      const response = await request(app)
        .post('/create-payment-intent')
        .send({
          amount: 25, // Below minimum of 50
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toContainEqual(
        expect.objectContaining({
          field: 'amount',
          message: 'Minimum amount is $0.50 (50 cents)'
        })
      );
    });

    test('VALID-PI2: Should reject amount above maximum (> 1,000,000 cents)', async () => {
      const response = await request(app)
        .post('/create-payment-intent')
        .send({
          amount: 1000001, // Above maximum of 1000000
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toContainEqual(
        expect.objectContaining({
          field: 'amount',
          message: 'Maximum amount exceeded'
        })
      );
    });

    test('VALID-PI3: Should reject non-integer amount', async () => {
      const response = await request(app)
        .post('/create-payment-intent')
        .send({
          amount: 100.50, // Must be integer (cents)
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toContainEqual(
        expect.objectContaining({
          field: 'amount',
          message: 'Amount must be an integer'
        })
      );
    });

    test('VALID-PI4: Should reject invalid email format', async () => {
      const response = await request(app)
        .post('/create-payment-intent')
        .send({
          amount: 10000,
          email: 'not-an-email' // Invalid email
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toContainEqual(
        expect.objectContaining({
          field: 'email',
          message: 'Invalid email format'
        })
      );
    });

    test('VALID-PI5: Should accept valid amount without email', async () => {
      stripeMocks.mockPaymentIntentsCreate.mockResolvedValue(
        mockPaymentIntentSuccess({ receipt_email: null })
      );

      const response = await request(app)
        .post('/create-payment-intent')
        .send({
          amount: 10000
          // email is optional
        })
        .expect(200);

      expect(response.body.clientSecret).toBeDefined();
      expect(stripeMocks.mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 10000,
          receipt_email: undefined
        })
      );
    });
  });

  // ============================================================================
  // HAPPY PATH TESTS
  // ============================================================================

  describe('Successful Payment Intent Creation', () => {
    test('HAPPY-PI1: Should create payment intent successfully', async () => {
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
      stripeMocks.mockPaymentIntentsCreate.mockResolvedValue(
        mockPaymentIntentSuccess()
      );

      await request(app)
        .post('/create-payment-intent')
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
      stripeMocks.mockPaymentIntentsCreate.mockResolvedValue(
        mockPaymentIntentSuccess()
      );

      await request(app)
        .post('/create-payment-intent')
        .send({
          amount: 10000,
          email: 'test@example.com'
          // promoCode not provided
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
      const mockPaymentIntent = mockPaymentIntentSuccess({
        client_secret: 'pi_special_secret_xyz123',
        id: 'pi_special_xyz'
      });

      stripeMocks.mockPaymentIntentsCreate.mockResolvedValue(mockPaymentIntent);

      const response = await request(app)
        .post('/create-payment-intent')
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
      const stripeError = mockPaymentIntentError('Your card was declined');
      stripeMocks.mockPaymentIntentsCreate.mockRejectedValue(stripeError);

      const response = await request(app)
        .post('/create-payment-intent')
        .send({
          amount: 10000,
          email: 'test@example.com'
        })
        .expect(500);

      expect(response.body.error).toBe('Your card was declined');
    });

    test('ERROR-PI2: Should handle Stripe API connection error', async () => {
      const connectionError = new Error('Network error: unable to connect to Stripe');
      stripeMocks.mockPaymentIntentsCreate.mockRejectedValue(connectionError);

      const response = await request(app)
        .post('/create-payment-intent')
        .send({
          amount: 10000,
          email: 'test@example.com'
        })
        .expect(500);

      expect(response.body.error).toBe('Network error: unable to connect to Stripe');
    });

    test('ERROR-PI3: Should handle missing Stripe API key', async () => {
      const authError = new Error('Invalid API Key provided');
      stripeMocks.mockPaymentIntentsCreate.mockRejectedValue(authError);

      const response = await request(app)
        .post('/create-payment-intent')
        .send({
          amount: 10000,
          email: 'test@example.com'
        })
        .expect(500);

      expect(response.body.error).toBe('Invalid API Key provided');
    });
  });
});
