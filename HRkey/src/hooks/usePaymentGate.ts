/**
 * usePaymentGate Hook
 *
 * React hook for handling payment-gated actions.
 * Automatically handles PAYMENT_REQUIRED errors and redirects to Stripe.
 */

import { useState, useCallback } from "react";
import {
  isPaymentRequiredError,
  getProductCodeFromError,
  redirectToCheckout,
  PAYMENT_REQUIRED_MESSAGES,
  type PaymentRequiredError,
} from "../lib/paymentGate";
import { ApiClientError } from "../lib/apiClient";

interface PaymentGateState {
  isPaymentRequired: boolean;
  productCode: string | null;
  message: string | null;
  isRedirecting: boolean;
}

interface UsePaymentGateReturn extends PaymentGateState {
  /**
   * Handle an API error, checking for payment required
   * Returns true if it was a payment required error
   */
  handleError: (error: unknown) => boolean;

  /**
   * Redirect to Stripe checkout for the current product
   */
  proceedToPayment: () => Promise<void>;

  /**
   * Clear the payment required state
   */
  clearPaymentRequired: () => void;
}

export function usePaymentGate(): UsePaymentGateReturn {
  const [state, setState] = useState<PaymentGateState>({
    isPaymentRequired: false,
    productCode: null,
    message: null,
    isRedirecting: false,
  });

  const handleError = useCallback((error: unknown): boolean => {
    if (!isPaymentRequiredError(error)) {
      return false;
    }

    const productCode = getProductCodeFromError(error as ApiClientError);
    if (!productCode) {
      return false;
    }

    const message =
      PAYMENT_REQUIRED_MESSAGES[productCode as keyof typeof PAYMENT_REQUIRED_MESSAGES] ||
      `This action requires payment for: ${productCode}`;

    setState({
      isPaymentRequired: true,
      productCode,
      message,
      isRedirecting: false,
    });

    return true;
  }, []);

  const proceedToPayment = useCallback(async () => {
    if (!state.productCode) {
      throw new Error("No product code set");
    }

    setState((prev) => ({ ...prev, isRedirecting: true }));

    try {
      await redirectToCheckout(state.productCode);
    } catch (error) {
      setState((prev) => ({ ...prev, isRedirecting: false }));
      throw error;
    }
  }, [state.productCode]);

  const clearPaymentRequired = useCallback(() => {
    setState({
      isPaymentRequired: false,
      productCode: null,
      message: null,
      isRedirecting: false,
    });
  }, []);

  return {
    ...state,
    handleError,
    proceedToPayment,
    clearPaymentRequired,
  };
}

export default usePaymentGate;
