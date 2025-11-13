'use client';

import { collection, doc, getDoc, increment, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { subscribeToAuth } from './auth';
import { getStoreCollectionPath, getStoreDocPath } from './store-collections';

/**
 * Track an analytics event for an authenticated user
 * @param {string} eventType - 'view_category', 'view_product', 'add_to_cart', etc.
 * @param {string} entityId - The ID of the category/product being viewed
 * @param {object} metadata - Optional metadata (variantId, source, etc.)
 */
export const trackEvent = async (eventType, entityId, metadata = {}) => {
  const db = getFirebaseDb();
  if (!db) {
    console.warn('Firestore not initialized, skipping analytics');
    return;
  }

  // Get current user - use a timeout to avoid waiting indefinitely
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(); // Resolve silently if auth check takes too long
      }
    }, 1000);

    const unsubscribe = subscribeToAuth(async (user) => {
      if (resolved) return;
      clearTimeout(timeout);
      resolved = true;
      unsubscribe();
      
      if (!user) {
        // Only track for authenticated users
        resolve();
        return;
      }

      try {
        // Write event to userEvents collection
        const eventRef = doc(collection(db, ...getStoreCollectionPath('userEvents')));
        await setDoc(eventRef, {
          userId: user.uid,
          eventType,
          entityId,
          metadata,
          timestamp: serverTimestamp(),
        });

        // Update aggregated metrics on the entity
        await updateEntityMetrics(eventType, entityId, db);

        resolve();
      } catch (error) {
        // Silently fail - don't log permission errors for unauthenticated users
        if (error.code !== 'permission-denied') {
          console.error('Failed to track event', error);
        }
        resolve(); // Don't throw - analytics shouldn't break the app
      }
    });
  });
};

/**
 * Update aggregated metrics on products/categories when events occur
 */
const updateEntityMetrics = async (eventType, entityId, db) => {
  try {
    if (eventType === 'view_category') {
      const categoryRef = doc(db, ...getStoreDocPath('categories', entityId));
      await runTransaction(db, async (transaction) => {
        const categoryDoc = await transaction.get(categoryRef);
        if (categoryDoc.exists()) {
          const currentViews = categoryDoc.data().metrics?.totalViews || 0;
          transaction.update(categoryRef, {
            'metrics.totalViews': increment(1),
            'metrics.lastViewedAt': serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });
    } else if (eventType === 'view_product') {
      const productRef = doc(db, ...getStoreDocPath('products', entityId));
      await runTransaction(db, async (transaction) => {
        const productDoc = await transaction.get(productRef);
        if (productDoc.exists()) {
          transaction.update(productRef, {
            'metrics.totalViews': increment(1),
            'metrics.lastViewedAt': serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });
    }
  } catch (error) {
    console.error('Failed to update entity metrics', error);
    // Don't throw - metrics update failure shouldn't break the app
  }
};

/**
 * Track category view
 */
export const trackCategoryView = (categoryId) => {
  return trackEvent('view_category', categoryId);
};

/**
 * Track product view
 */
export const trackProductView = (productId, metadata = {}) => {
  return trackEvent('view_product', productId, metadata);
};

/**
 * Track add to cart (for future use)
 */
export const trackAddToCart = (productId, variantId = null) => {
  return trackEvent('add_to_cart', productId, { variantId });
};

