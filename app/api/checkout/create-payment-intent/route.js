import { NextResponse } from 'next/server';

/**
 * Create a Stripe payment intent
 * This is called before checkout to reserve the payment amount
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { amount, currency = 'usd', cart } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    // Check if Stripe is configured
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.' },
        { status: 500 }
      );
    }

    // Import Stripe dynamically (only if configured)
    const stripe = (await import('stripe')).default(STRIPE_SECRET_KEY);

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: {
        cartItems: JSON.stringify(cart.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        }))),
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Failed to create payment intent:', error);
    return NextResponse.json(
      { error: 'Failed to create payment intent', message: error.message },
      { status: 500 }
    );
  }
}


