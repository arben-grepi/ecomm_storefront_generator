import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firestore-server';

/**
 * API route to track storefront visits
 * Called by middleware after detecting storefront and country
 * 
 * Increments visit counter and logs visit with country
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { storefront, country } = body;

    if (!storefront) {
      return NextResponse.json(
        { error: 'storefront is required' },
        { status: 400 }
      );
    }

    if (!country) {
      return NextResponse.json(
        { error: 'country is required' },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn('[Track Visit] ⚠️  Firestore admin not available, skipping visit tracking');
      return NextResponse.json(
        { error: 'Firestore not available' },
        { status: 503 }
      );
    }

    // Get analytics document reference
    const analyticsRef = adminDb.collection(storefront).doc('analytics');
    const analyticsDoc = await analyticsRef.get();

    // Initialize analytics document if it doesn't exist
    if (!analyticsDoc.exists) {
      await analyticsRef.set({
        visitCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Atomically increment visit counter
    await analyticsRef.update({
      visitCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Log individual visit with country in subcollection
    const visitsRef = analyticsRef.collection('visits');
    await visitsRef.add({
      country: country.toUpperCase(),
      timestamp: FieldValue.serverTimestamp(),
      storefront: storefront,
    });

    console.log(`[Track Visit] ✅ Tracked visit for ${storefront} from ${country}`);

    return NextResponse.json({
      success: true,
      storefront,
      country,
    });
  } catch (error) {
    console.error('[Track Visit] ❌ Error tracking visit:', error);
    // Don't fail the request - analytics shouldn't break the app
    return NextResponse.json(
      { error: 'Failed to track visit', message: error.message },
      { status: 500 }
    );
  }
}

