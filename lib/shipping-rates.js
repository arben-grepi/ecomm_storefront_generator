/**
 * Simple shipping rates storage and retrieval
 * Stores rates in a single Firestore document for fast access
 */

import { getFirebaseDb } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getMarketConfig } from './market-utils';

/**
 * Get shipping rate for a country from Firestore
 * Falls back to market config if not found
 */
export async function getShippingRate(countryCode) {
  const db = getFirebaseDb();
  if (!db) {
    // Fallback to market config if Firebase not available
    const marketConfig = getMarketConfig(countryCode);
    return parseFloat(marketConfig.shippingEstimate || '7.00');
  }

  try {
    const shippingRatesRef = doc(db, 'shippingRates', 'rates');
    const shippingRatesDoc = await getDoc(shippingRatesRef);
    
    if (shippingRatesDoc.exists()) {
      const data = shippingRatesDoc.data();
      const rate = data[countryCode]?.standard || data[countryCode];
      
      if (rate) {
        return parseFloat(rate);
      }
    }
  } catch (error) {
    console.error(`[Shipping] Failed to fetch shipping rate for ${countryCode}:`, error);
  }

  // Fallback to market config
  const marketConfig = getMarketConfig(countryCode);
  return parseFloat(marketConfig.shippingEstimate || '7.00');
}

/**
 * Get all shipping rates (for admin/debugging)
 */
export async function getAllShippingRates() {
  const db = getFirebaseDb();
  if (!db) {
    return null;
  }

  try {
    const shippingRatesRef = doc(db, 'shippingRates', 'rates');
    const shippingRatesDoc = await getDoc(shippingRatesRef);
    
    if (shippingRatesDoc.exists()) {
      return shippingRatesDoc.data();
    }
  } catch (error) {
    console.error('[Shipping] Failed to fetch all shipping rates:', error);
  }

  return null;
}

