import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

// Initialize Firebase Admin
function getAdminDb() {
  if (getApps().length === 0) {
    try {
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        });
      } else {
        initializeApp({
          projectId: 'ecommerce-2f366',
        });
      }
    } catch (error) {
      console.error('Firebase Admin initialization failed:', error);
      return null;
    }
  }
  return getFirestore();
}

export async function POST(request) {
  try {
    const { paymentIntentId, orderData } = await request.json();

    if (!paymentIntentId || !orderData) {
      return NextResponse.json(
        { error: 'Missing paymentIntentId or orderData' },
        { status: 400 }
      );
    }

    // Retrieve the payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json(
        { error: `Payment not succeeded. Status: ${paymentIntent.status}` },
        { status: 400 }
      );
    }

    // Create order in Firestore
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      );
    }

    const orderRef = db.collection('orders').doc();
    const order = {
      ...orderData,
      paymentSummary: {
        provider: 'stripe',
        transactionId: paymentIntentId,
        last4: paymentIntent.charges?.data[0]?.payment_method_details?.card?.last4 || null,
      },
      status: 'paid',
      placedAt: new Date(),
      createdAt: new Date(),
    };

    await orderRef.set(order);

    // Update variant stock (decrease by quantity)
    if (orderData.items && Array.isArray(orderData.items)) {
      const batch = db.batch();
      
      for (const item of orderData.items) {
        if (item.variantId && item.productId) {
          const variantRef = db
            .collection('products')
            .doc(item.productId)
            .collection('variants')
            .doc(item.variantId);
          
          const variantDoc = await variantRef.get();
          if (variantDoc.exists) {
            const currentStock = variantDoc.data().stock || 0;
            const newStock = Math.max(0, currentStock - item.quantity);
            batch.update(variantRef, { stock: newStock });
          }
        }
      }
      
      await batch.commit();
    }

    // Clear cart if userId is provided
    if (orderData.userId) {
      const cartRef = db.collection('carts').doc(orderData.userId);
      await cartRef.set(
        {
          items: [],
          status: 'converted',
          lastUpdated: new Date(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: orderRef.id,
      paymentIntentId,
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to confirm payment' },
      { status: 500 }
    );
  }
}

