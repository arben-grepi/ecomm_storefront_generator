'use client';

/**
 * Client-side caching for Info documents per storefront
 * Uses sessionStorage to cache Info data per storefront
 * Similar pattern to storefront caching
 */

const CACHE_PREFIX = 'ecommerce_info_';
const CACHE_TIMESTAMP_PREFIX = 'ecommerce_info_timestamp_';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache duration

/**
 * Get cached Info document for a storefront
 * @param {string} storefront - Storefront code (e.g., 'LUNERA', 'FIVESTARFINDS')
 * @returns {object|null} Cached Info document or null if not cached/expired
 */
export function getCachedInfo(storefront) {
  if (typeof window === 'undefined' || !storefront) return null;
  
  try {
    const cacheKey = `${CACHE_PREFIX}${storefront}`;
    const timestampKey = `${CACHE_TIMESTAMP_PREFIX}${storefront}`;
    
    const cachedData = sessionStorage.getItem(cacheKey);
    const cachedTimestamp = sessionStorage.getItem(timestampKey);
    
    if (!cachedData || !cachedTimestamp) return null;
    
    // Check if cache is expired
    const now = Date.now();
    const cacheTime = parseInt(cachedTimestamp, 10);
    if (now - cacheTime > CACHE_DURATION) {
      // Cache expired, remove it
      sessionStorage.removeItem(cacheKey);
      sessionStorage.removeItem(timestampKey);
      return null;
    }
    
    // Parse and return cached data
    return JSON.parse(cachedData);
  } catch (error) {
    console.warn('[InfoCache] Failed to read cached info:', error);
    return null;
  }
}

/**
 * Save Info document to cache for a storefront
 * @param {string} storefront - Storefront code
 * @param {object} infoData - Info document data
 */
export function saveInfoToCache(storefront, infoData) {
  if (typeof window === 'undefined' || !storefront || !infoData) return;
  
  try {
    const cacheKey = `${CACHE_PREFIX}${storefront}`;
    const timestampKey = `${CACHE_TIMESTAMP_PREFIX}${storefront}`;
    
    sessionStorage.setItem(cacheKey, JSON.stringify(infoData));
    sessionStorage.setItem(timestampKey, Date.now().toString());
  } catch (error) {
    console.warn('[InfoCache] Failed to save info to cache:', error);
    // Handle quota exceeded error gracefully
    if (error.name === 'QuotaExceededError') {
      // Clear oldest cache entries if quota exceeded
      clearOldestCacheEntries();
      // Try again
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(infoData));
        sessionStorage.setItem(timestampKey, Date.now().toString());
      } catch (retryError) {
        console.error('[InfoCache] Failed to save after clearing cache:', retryError);
      }
    }
  }
}

/**
 * Clear cached Info for a specific storefront
 * @param {string} storefront - Storefront code
 */
export function clearCachedInfo(storefront) {
  if (typeof window === 'undefined' || !storefront) return;
  
  try {
    const cacheKey = `${CACHE_PREFIX}${storefront}`;
    const timestampKey = `${CACHE_TIMESTAMP_PREFIX}${storefront}`;
    
    sessionStorage.removeItem(cacheKey);
    sessionStorage.removeItem(timestampKey);
  } catch (error) {
    console.warn('[InfoCache] Failed to clear cached info:', error);
  }
}

/**
 * Clear all cached Info documents
 */
export function clearAllCachedInfo() {
  if (typeof window === 'undefined') return;
  
  try {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith(CACHE_PREFIX) || key.startsWith(CACHE_TIMESTAMP_PREFIX))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
  } catch (error) {
    console.warn('[InfoCache] Failed to clear all cached info:', error);
  }
}

/**
 * Clear oldest cache entries when quota is exceeded
 */
function clearOldestCacheEntries() {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheEntries = [];
    
    // Collect all cache entries with timestamps
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(CACHE_TIMESTAMP_PREFIX)) {
        const storefront = key.replace(CACHE_TIMESTAMP_PREFIX, '');
        const timestamp = parseInt(sessionStorage.getItem(key), 10);
        cacheEntries.push({ storefront, timestamp, key });
      }
    }
    
    // Sort by timestamp (oldest first)
    cacheEntries.sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove oldest 50% of entries
    const entriesToRemove = Math.floor(cacheEntries.length / 2);
    for (let i = 0; i < entriesToRemove; i++) {
      const entry = cacheEntries[i];
      clearCachedInfo(entry.storefront);
    }
  } catch (error) {
    console.warn('[InfoCache] Failed to clear oldest cache entries:', error);
  }
}

/**
 * Check if cached Info exists and is valid for a storefront
 * @param {string} storefront - Storefront code
 * @returns {boolean} True if valid cache exists
 */
export function hasValidCachedInfo(storefront) {
  return getCachedInfo(storefront) !== null;
}

