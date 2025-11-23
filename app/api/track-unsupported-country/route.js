import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

/**
 * Track when users from unsupported countries visit the site
 * Stores data in storefronts/{storefront}/unsupportedCountries collection
 */
export async function POST(request) {
  try {
    const { country, pathname } = await request.json();

    if (!country) {
      console.warn('[Tracking] Missing country in unsupported country visit');
      return NextResponse.json({ error: 'Country is required' }, { status: 400 });
    }

    console.log(`[Tracking] Unsupported country visit - Country: ${country}, Path: ${pathname || '/'}`);

    const db = getAdminDb();
    if (!db) {
      console.error('[Tracking] Firebase not initialized');
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    // For now, track in a general collection
    // TODO: If you have multiple storefronts, use storefront-specific collection
    const timestamp = new Date();
    const docRef = db.collection('storefronts').doc('LUNERA')
      .collection('unsupportedCountries').doc();

    await docRef.set({
      country,
      pathname: pathname || '/',
      timestamp,
      createdAt: timestamp,
    });

    console.log(`[Tracking] Tracked unsupported country visit - Country: ${country}, Document ID: ${docRef.id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Tracking] Failed to track unsupported country:', error.message || error);
    return NextResponse.json({ error: 'Failed to track visit' }, { status: 500 });
  }
}

