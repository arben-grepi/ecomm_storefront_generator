import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firestore-server';

/**
 * Store email signups from unavailable page
 * Stores in storefronts/{storefront}/countrySignups collection
 */
export async function POST(request) {
  try {
    const { email, country } = await request.json();

    if (!email || !country) {
      console.warn('[Signup] Missing email or country in signup request');
      return NextResponse.json({ error: 'Email and country are required' }, { status: 400 });
    }

    // Don't log full email for security (GDPR/compliance) - only log domain
    const emailDomain = email.includes('@') ? email.split('@')[1] : 'unknown';
    console.log(`[Signup] Country signup - Email domain: ${emailDomain}, Country: ${country}`);

    const db = getAdminDb();
    if (!db) {
      console.error('[Signup] Firebase not initialized');
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const timestamp = new Date();
    const docRef = db.collection('storefronts').doc('LUNERA')
      .collection('countrySignups').doc();

    await docRef.set({
      email,
      country,
      timestamp,
      createdAt: timestamp,
    });

    // Don't log full email for security (GDPR/compliance)
    console.log(`[Signup] Stored country signup - Country: ${country}, Document ID: ${docRef.id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Signup] Failed to store email signup:', error.message || error);
    return NextResponse.json({ error: 'Failed to store signup' }, { status: 500 });
  }
}

