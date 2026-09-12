import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firestore-server';

/**
 * API route to get all available storefronts
 * Uses Admin SDK to list root-level collections (excluding shopifyItems, carts, etc.)
 */
export async function GET() {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ storefronts: ['LUNERA'] }, { status: 200 });
    }

    const storefronts = [];
    const excludedCollections = ['shopifyItems', 'carts', 'orders', 'users', 'userEvents'];

    try {
      const collections = await adminDb.listCollections();

      for (const coll of collections) {
        const id = coll.id;

        if (excludedCollections.includes(id)) {
          continue;
        }

        try {
          const infoRef = coll.doc('Info');
          const infoSnap = await infoRef.get();
          if (infoSnap.exists) {
            storefronts.push(id);
          }
        } catch (infoError) {
          if (id === 'LUNERA') {
            storefronts.push(id);
          }
        }
      }
    } catch (error) {
      console.error('Error listing collections:', error);
      return NextResponse.json({ storefronts: ['LUNERA'] }, { status: 200 });
    }

    if (storefronts.length === 0) {
      storefronts.push('LUNERA');
    }

    // Prefer LUNERA first for the current single-store phase
    storefronts.sort((a, b) => {
      if (a === 'LUNERA') return -1;
      if (b === 'LUNERA') return 1;
      return a.localeCompare(b);
    });

    return NextResponse.json({ storefronts }, { status: 200 });
  } catch (error) {
    console.error('Error fetching storefronts:', error);
    return NextResponse.json({ storefronts: ['LUNERA'] }, { status: 200 });
  }
}
