/**
 * Payment Gate Utilities
 *
 * Handles PAYMENT_REQUIRED (402) responses from API
 * when users attempt actions that require payment.
 */

import { apiPost, ApiClientError } from "./apiClient";

export interface PaymentRequiredError {
  error: "PAYMENT_REQUIRED";
  product_code: string;
}

export interface CheckoutSessionResponse {
  success: boolean;
  checkout_url: string;
  session_id: string;
}

/**
 * Check if an error is a payment required error
 */
export function isPaymentRequiredError(error: unknown): error is ApiClientError {
  return (
    error instanceof ApiClientError &&
    error.status === 402 &&
    (error.details as PaymentRequiredError)?.error === "PAYMENT_REQUIRED"
  );
}

/**
 * Extract the product code from a payment required error
 */
export function getProductCodeFromError(error: ApiClientError): string | null {
  const details = error.details as PaymentRequiredError;
  return details?.product_code || null;
}

/**
 * Create a Stripe checkout session and redirect user
 *
 * @param productCode - The product code to purchase (e.g., 'additional_reference')
 * @returns The checkout URL (also redirects automatically)
 */
export async function redirectToCheckout(productCode: string): Promise<string> {
  const response = await apiPost<CheckoutSessionResponse>(
    "/api/billing/create-checkout-session",
    { product_code: productCode }
  );

  if (response.success && response.checkout_url) {
    // Redirect to Stripe Checkout
    window.location.href = response.checkout_url;
    return response.checkout_url;
  }

  throw new Error("Failed to create checkout session");
}

/**
 * Handle a payment required error by showing a message and redirecting to checkout
 *
 * @param error - The ApiClientError from the API
 * @param options - Configuration options
 * @returns true if handled as payment required, false otherwise
 */
export async function handlePaymentRequiredError(
  error: unknown,
  options: {
    onPaymentRequired?: (productCode: string) => void | Promise<void>;
    autoRedirect?: boolean;
    customMessage?: string;
  } = {}
): Promise<boolean> {
  if (!isPaymentRequiredError(error)) {
    return false;
  }

  const productCode = getProductCodeFromError(error);
  if (!productCode) {
    return false;
  }

  // Default message for additional_reference
  const defaultMessage =
    productCode === "additional_reference"
      ? "You've used your free reference. Additional references require payment."
      : `This action requires payment for: ${productCode}`;

  const message = options.customMessage || defaultMessage;

  // Call custom handler if provided
  if (options.onPaymentRequired) {
    await options.onPaymentRequired(productCode);
  }

  // Auto-redirect to checkout if enabled
  if (options.autoRedirect !== false) {
    const userConfirmed = window.confirm(`${message}\n\nWould you like to proceed to payment?`);
    if (userConfirmed) {
      await redirectToCheckout(productCode);
    }
  }

  return true;
}

/**
 * Payment required message for display in UI
 */
export const PAYMENT_REQUIRED_MESSAGES = {
  additional_reference: "You've used your free reference. Additional references require payment.",
} as const;
