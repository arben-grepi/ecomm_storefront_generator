import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firestore-server';
import { getActiveStorefronts } from '@/lib/market-utils';

/**
 * API route to get available (active) storefronts for admin UI.
 *
 * Source of truth: STOREFRONT_MARKETS in lib/market-utils.js
 * Old Firestore root collections (FIVESTARFINDS, HEALTH, …) may still exist,
 * but they are ignored until added back to STOREFRONT_MARKETS.
 */
export async function GET() {
  try {
    const activeStorefronts = getActiveStorefronts();
    const adminDb = getAdminDb();

    if (!adminDb) {
      return NextResponse.json({ storefronts: activeStorefronts }, { status: 200 });
    }

    // Prefer LUNERA first for the current single-store phase
    const storefronts = [...activeStorefronts].sort((a, b) => {
      if (a === 'LUNERA') return -1;
      if (b === 'LUNERA') return 1;
      return a.localeCompare(b);
    });

    return NextResponse.json({ storefronts }, { status: 200 });
  } catch (error) {
    console.error('Error fetching storefronts:', error);
    return NextResponse.json({ storefronts: getActiveStorefronts() }, { status: 200 });
  }
}
