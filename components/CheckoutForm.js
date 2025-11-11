'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
  AddressElement,
} from '@stripe/react-stripe-js';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart';
import { subscribeToAuth } from '@/lib/auth';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

export default function CheckoutForm({ total, subtotal, shipping }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { cart, clearCart } = useCart();
  const [user, setUser] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [shippingAddress, setShippingAddress] = useState(null);

  // Subscribe to auth state
  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  // Create payment intent when component mounts
  useEffect(() => {
    if (!total || total < 0.5) return;

    const createPaymentIntent = async () => {
      try {
        const response = await fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: total,
            currency: 'usd',
            metadata: {
              userId: user?.uid || 'guest',
              itemCount: cart.length,
            },
          }),
        });

        const data = await response.json();
        if (data.error) {
          setError(data.error);
          return;
        }

        setClientSecret(data.clientSecret);
      } catch (err) {
        setError('Failed to initialize payment. Please try again.');
        console.error('Error creating payment intent:', err);
      }
    };

    createPaymentIntent();
  }, [total, cart.length, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Confirm payment with Stripe
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message);
        setIsProcessing(false);
        return;
      }

      const { error: paymentError, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/order-confirmation`,
        },
        redirect: 'if_required',
      });

      if (paymentError) {
        setError(paymentError.message);
        setIsProcessing(false);
        return;
      }

      if (paymentIntent.status === 'succeeded') {
        // Create order in database
        const orderData = {
          userId: user?.uid || null,
          items: cart.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || null,
            quantity: item.quantity,
            unitPrice: item.priceAtAdd,
            subtotal: item.priceAtAdd * item.quantity,
            productName: item.productName,
            variantName: item.variantName || null,
            image: item.image || null,
          })),
          totals: {
            subtotal,
            discounts: 0,
            tax: 0, // Add tax calculation if needed
            shipping,
            grandTotal: total,
          },
          shippingAddress: shippingAddress || {},
          status: 'paid',
        };

        const confirmResponse = await fetch('/api/confirm-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentIntentId: paymentIntent.id,
            orderData,
          }),
        });

        const confirmData = await confirmResponse.json();

        if (confirmData.error) {
          setError(confirmData.error);
          setIsProcessing(false);
          return;
        }

        // Clear cart and redirect to confirmation page
        await clearCart();
        router.push(`/order-confirmation?orderId=${confirmData.orderId}`);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Payment error:', err);
      setIsProcessing(false);
    }
  };

  if (!clientSecret) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-200 border-t-pink-500" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-pink-400">
          Shipping Address
        </h3>
        <AddressElement
          options={{
            mode: 'shipping',
            allowedCountries: ['US', 'GB', 'CA', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH'],
          }}
          onChange={(event) => {
            if (event.complete) {
              setShippingAddress(event.value.address);
            }
          }}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-pink-400">
          Payment Details
        </h3>
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || isProcessing || !shippingAddress}
        className={`w-full rounded-full bg-pink-500 px-8 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow-lg transition hover:bg-pink-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {isProcessing ? 'Processing...' : `Pay ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}`}
      </button>
    </form>
  );
}

// Wrapper component to provide Stripe context
export function CheckoutFormWrapper({ total, subtotal, shipping }) {
  const [stripePromiseState, setStripePromiseState] = useState(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      setStripePromiseState(stripePromise);
    }
  }, []);

  if (!stripePromiseState) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        Stripe is not configured. Please add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to your environment variables.
      </div>
    );
  }

  return (
    <Elements stripe={stripePromiseState} options={{ appearance: { theme: 'stripe' } }}>
      <CheckoutForm total={total} subtotal={subtotal} shipping={shipping} />
    </Elements>
  );
}

