import { NextResponse } from 'next/server';

/**
 * Confirm payment and create order
 * Called after Stripe payment is confirmed
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { paymentIntentId } = body;

    if (!paymentIntentId) {
      return NextResponse.json(
        { error: 'Payment intent ID is required' },
        { status: 400 }
      );
    }

    // Verify payment with Stripe
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 500 }
      );
    }

    const stripe = (await import('stripe')).default(STRIPE_SECRET_KEY);

    // Retrieve payment intent to verify status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json(
        { error: `Payment not succeeded. Status: ${paymentIntent.status}` },
        { status: 400 }
      );
    }

    // Payment is confirmed - return success
    // The order creation will be handled by the frontend calling create-order endpoint
    return NextResponse.json({
      ok: true,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100, // Convert from cents
      status: paymentIntent.status,
    });
  } catch (error) {
    console.error('Failed to confirm payment:', error);
    return NextResponse.json(
      { error: 'Failed to confirm payment', message: error.message },
      { status: 500 }
    );
  }
}


