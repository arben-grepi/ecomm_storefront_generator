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
    const excludedCollections = ['shopifyItems', 'carts', 'orders', 'users', 'userEvents', 'shippingRates'];
    
    try {
      // List all root-level collections
      const collections = await adminDb.listCollections();
      
      for (const coll of collections) {
        const id = coll.id;
        
        // Skip excluded collections
        if (excludedCollections.includes(id)) {
          continue;
        }
        
        // Only check for Info document - if it exists, it's a storefront
        try {
          const infoRef = coll.doc('Info');
          const infoSnap = await infoRef.get();
          // If Info document exists, it's a storefront
          if (infoSnap.exists) {
            storefronts.push(id);
          }
        } catch (infoError) {
          // Info document doesn't exist or can't be accessed - not a storefront
          // Always include LUNERA as default storefront even if Info doesn't exist
          if (id === 'LUNERA') {
            storefronts.push(id);
          }
        }
      }
    } catch (error) {
      console.error('Error listing collections:', error);
      // Fallback to default
      return NextResponse.json({ storefronts: ['LUNERA'] }, { status: 200 });
    }

    // Ensure at least LUNERA is included
    if (storefronts.length === 0) {
      storefronts.push('LUNERA');
    }

    // Sort alphabetically
    storefronts.sort();

    return NextResponse.json({ storefronts }, { status: 200 });
  } catch (error) {
    console.error('Error fetching storefronts:', error);
    return NextResponse.json({ storefronts: ['LUNERA'] }, { status: 200 });
  }
}

