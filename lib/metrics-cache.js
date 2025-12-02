'use client';

/**
 * Metrics Cache Utility
 * Caches metrics data in localStorage with TTL (Time To Live)
 * Metrics change less frequently, so we can cache them to reduce Firestore queries
 */

const METRICS_CACHE_KEY = 'admin_metrics_cache';
const METRICS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Get cached metrics if available and not expired
 * @param {string} cacheKey - Unique key for this metrics set (e.g., 'overview_LUNERA')
 * @returns {object|null} - Cached metrics or null if not available/expired
 */
export function getCachedMetrics(cacheKey) {
  if (typeof window === 'undefined') return null;
  
  try {
    const cacheData = localStorage.getItem(METRICS_CACHE_KEY);
    if (!cacheData) return null;
    
    const cache = JSON.parse(cacheData);
    const cached = cache[cacheKey];
    
    if (!cached) return null;
    
    // Check if cache is expired
    const now = Date.now();
    if (now - cached.timestamp > METRICS_CACHE_TTL) {
      // Remove expired entry
      delete cache[cacheKey];
      localStorage.setItem(METRICS_CACHE_KEY, JSON.stringify(cache));
      return null;
    }
    
    return cached.metrics;
  } catch (error) {
    console.warn('[MetricsCache] Failed to read cache:', error);
    return null;
  }
}

/**
 * Store metrics in cache
 * @param {string} cacheKey - Unique key for this metrics set
 * @param {object} metrics - Metrics data to cache
 */
export function setCachedMetrics(cacheKey, metrics) {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheData = localStorage.getItem(METRICS_CACHE_KEY);
    const cache = cacheData ? JSON.parse(cacheData) : {};
    
    cache[cacheKey] = {
      metrics,
      timestamp: Date.now(),
    };
    
    // Clean up old entries (keep only last 10 cache keys)
    const keys = Object.keys(cache);
    if (keys.length > 10) {
      // Sort by timestamp and remove oldest
      const sorted = keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp);
      sorted.slice(0, keys.length - 10).forEach((key) => delete cache[key]);
    }
    
    localStorage.setItem(METRICS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('[MetricsCache] Failed to write cache:', error);
    // If storage is full, try to clear old entries
    try {
      localStorage.removeItem(METRICS_CACHE_KEY);
    } catch (e) {
      // Storage might be disabled or full
    }
  }
}

/**
 * Clear all cached metrics
 */
export function clearMetricsCache() {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(METRICS_CACHE_KEY);
  } catch (error) {
    console.warn('[MetricsCache] Failed to clear cache:', error);
  }
}

/**
 * Clear cached metrics for a specific key
 * @param {string} cacheKey - Key to clear
 */
export function clearCachedMetrics(cacheKey) {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheData = localStorage.getItem(METRICS_CACHE_KEY);
    if (!cacheData) return;
    
    const cache = JSON.parse(cacheData);
    delete cache[cacheKey];
    localStorage.setItem(METRICS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('[MetricsCache] Failed to clear specific cache:', error);
  }
}

