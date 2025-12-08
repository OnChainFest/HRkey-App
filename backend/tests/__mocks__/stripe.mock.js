/**
 * Mock Stripe SDK for Testing
 * Provides mock implementations for Stripe payment intents and webhooks
 */

import { jest } from '@jest/globals';

// Mock payment intent object
export const mockPaymentIntent = {
  id: 'pi_test_1234567890',
  object: 'payment_intent',
  amount: 10000, // $100.00 in cents
  currency: 'usd',
  client_secret: 'pi_test_1234567890_secret_test123456789',
  status: 'requires_payment_method',
  metadata: {
    promoCode: 'TESTCODE',
    plan: 'pro-lifetime'
  },
  receipt_email: 'test@example.com',
  description: 'HRKey PRO - Lifetime Access'
};

// Mock webhook event
export const mockWebhookEvent = {
  id: 'evt_test_webhook',
  object: 'event',
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: 'pi_test_1234567890',
      object: 'payment_intent',
      amount: 10000,
      currency: 'usd',
      receipt_email: 'test@example.com',
      status: 'succeeded',
      metadata: {
        promoCode: 'TESTCODE',
        plan: 'pro-lifetime'
      }
    }
  },
  created: Math.floor(Date.now() / 1000)
};

/**
 * Create a mock Stripe instance
 */
export function createMockStripeClient() {
  const mockWebhooksConstructEvent = jest.fn();
  const mockPaymentIntentsCreate = jest.fn();

  const mockStripe = {
    paymentIntents: {
      create: mockPaymentIntentsCreate
    },
    webhooks: {
      constructEvent: mockWebhooksConstructEvent
    }
  };

  return {
    mockStripe,
    mockPaymentIntentsCreate,
    mockWebhooksConstructEvent
  };
}

/**
 * Helper: Mock successful payment intent creation
 */
export function mockPaymentIntentSuccess(overrides = {}) {
  return {
    ...mockPaymentIntent,
    ...overrides
  };
}

/**
 * Helper: Mock payment intent creation error
 */
export function mockPaymentIntentError(message = 'Payment intent creation failed') {
  const error = new Error(message);
  error.type = 'StripeCardError';
  error.code = 'card_declined';
  return error;
}

/**
 * Helper: Mock successful webhook event construction
 */
export function mockWebhookEventSuccess(eventType = 'payment_intent.succeeded', overrides = {}) {
  return {
    ...mockWebhookEvent,
    type: eventType,
    data: {
      object: {
        ...mockWebhookEvent.data.object,
        ...overrides
      }
    }
  };
}

/**
 * Helper: Mock webhook signature verification error
 */
export function mockWebhookSignatureError(message = 'Invalid signature') {
  const error = new Error(message);
  error.type = 'StripeSignatureVerificationError';
  return error;
}

/**
 * Helper: Reset all Stripe mocks
 */
export function resetStripeMocks(mocks) {
  mocks.mockPaymentIntentsCreate.mockClear();
  mocks.mockWebhooksConstructEvent.mockClear();
}

export default {
  createMockStripeClient,
  mockPaymentIntent,
  mockWebhookEvent,
  mockPaymentIntentSuccess,
  mockPaymentIntentError,
  mockWebhookEventSuccess,
  mockWebhookSignatureError,
  resetStripeMocks
};
