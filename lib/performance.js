/**
 * Performance monitoring utilities
 * Logs performance metrics to help identify bottlenecks
 */

// Only log performance in development or if explicitly enabled
const ENABLE_PERFORMANCE_LOGS = process.env.NODE_ENV === 'development' || 
                                 process.env.NEXT_PUBLIC_ENABLE_PERF_LOGS === 'true';

/**
 * Measure and log execution time of an async function
 */
export async function measureAsync(name, fn) {
  if (!ENABLE_PERFORMANCE_LOGS) {
    return await fn();
  }

  const startTime = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - startTime;
    
    if (duration > 1000) {
      console.warn(`[PERF] ⚠️  ${name} took ${duration.toFixed(2)}ms (slow)`);
    } else if (duration > 500) {
      console.log(`[PERF] ⏱️  ${name} took ${duration.toFixed(2)}ms`);
    } else {
      console.log(`[PERF] ✅ ${name} took ${duration.toFixed(2)}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[PERF] ❌ ${name} failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
}

/**
 * Measure and log execution time of a sync function
 */
export function measureSync(name, fn) {
  if (!ENABLE_PERFORMANCE_LOGS) {
    return fn();
  }

  const startTime = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - startTime;
    
    if (duration > 100) {
      console.warn(`[PERF] ⚠️  ${name} took ${duration.toFixed(2)}ms (slow)`);
    } else {
      console.log(`[PERF] ✅ ${name} took ${duration.toFixed(2)}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[PERF] ❌ ${name} failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
}

/**
 * Create a performance timer that can be started and stopped
 */
export function createTimer(name) {
  if (!ENABLE_PERFORMANCE_LOGS) {
    return {
      start: () => {},
      stop: () => {},
      lap: () => {},
    };
  }

  let startTime = null;
  let lapTimes = [];

  return {
    start: () => {
      startTime = performance.now();
      console.log(`[PERF] 🏁 ${name}: Started`);
    },
    lap: (lapName) => {
      if (startTime === null) {
        console.warn(`[PERF] ⚠️  ${name}: Cannot lap - timer not started`);
        return;
      }
      const lapTime = performance.now() - startTime;
      lapTimes.push({ name: lapName, time: lapTime });
      console.log(`[PERF] ⏱️  ${name}: Lap "${lapName}" at ${lapTime.toFixed(2)}ms`);
    },
    stop: () => {
      if (startTime === null) {
        console.warn(`[PERF] ⚠️  ${name}: Cannot stop - timer not started`);
        return;
      }
      const totalTime = performance.now() - startTime;
      console.log(`[PERF] 🏁 ${name}: Completed in ${totalTime.toFixed(2)}ms`);
      if (lapTimes.length > 0) {
        console.log(`[PERF] 📊 ${name} Laps:`, lapTimes.map(l => `${l.name}: ${l.time.toFixed(2)}ms`).join(', '));
      }
      startTime = null;
      lapTimes = [];
      return totalTime;
    },
  };
}

/**
 * Log image load performance
 */
export function logImageLoad(src, startTime) {
  if (!ENABLE_PERFORMANCE_LOGS) return;
  
  const duration = performance.now() - startTime;
  const imageName = src.split('/').pop();
  
  if (duration > 1000) {
    console.warn(`[PERF] ⚠️  Image "${imageName}" loaded in ${duration.toFixed(2)}ms (slow)`);
  } else if (duration > 500) {
    console.log(`[PERF] ⏱️  Image "${imageName}" loaded in ${duration.toFixed(2)}ms`);
  } else {
    console.log(`[PERF] ✅ Image "${imageName}" loaded in ${duration.toFixed(2)}ms`);
  }
}

/**
 * Monitor Firestore query performance
 */
export function logFirestoreQuery(queryName, startTime, docCount = 0) {
  if (!ENABLE_PERFORMANCE_LOGS) return;
  
  const duration = Date.now() - startTime;
  const docsPerMs = docCount > 0 ? (docCount / duration).toFixed(2) : 0;
  
  if (duration > 2000) {
    console.warn(`[PERF] ⚠️  Firestore query "${queryName}" took ${duration}ms (${docCount} docs, ${docsPerMs} docs/ms) - SLOW`);
  } else if (duration > 1000) {
    console.log(`[PERF] ⏱️  Firestore query "${queryName}" took ${duration}ms (${docCount} docs, ${docsPerMs} docs/ms)`);
  } else {
    console.log(`[PERF] ✅ Firestore query "${queryName}" took ${duration}ms (${docCount} docs, ${docsPerMs} docs/ms)`);
  }
}

