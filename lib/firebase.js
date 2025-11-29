'use client';

import { getApps, initializeApp, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';

// Cache the parsed config and app instance
let firebaseClientConfig = null;
let configCheckAttempted = false; // Track if we've already checked for config
let appInstance = null;
let authInstance = null;
let dbInstance = null;

/**
 * Get Firebase client configuration
 * Uses NEXT_PUBLIC_* variables (available in both production and local dev)
 */
const getFirebaseClientConfig = () => {
  // Return cached config if available (success or failure)
  if (firebaseClientConfig !== null) {
    return firebaseClientConfig;
  }

  // If we've already checked and failed, return null without logging again
  if (configCheckAttempted) {
    return null;
  }

  configCheckAttempted = true;

  // Use individual NEXT_PUBLIC_* variables
  // Note: FIREBASE_WEBAPP_CONFIG is server-side only, so we use NEXT_PUBLIC_* for client-side
  const localConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };

  if (localConfig.apiKey && localConfig.projectId && localConfig.appId) {
    console.log('[Firebase] ✅ Client config loaded from NEXT_PUBLIC_* variables');
    firebaseClientConfig = localConfig;
    return localConfig;
  } else {
    // Log error only once
    console.error('[Firebase] ❌ Incomplete config from NEXT_PUBLIC_* variables:', {
      apiKey: localConfig.apiKey ? '✅ Set' : '❌ Missing',
      authDomain: localConfig.authDomain ? '✅ Set' : '❌ Missing',
      projectId: localConfig.projectId ? '✅ Set' : '❌ Missing',
      storageBucket: localConfig.storageBucket ? '✅ Set' : '❌ Missing',
      messagingSenderId: localConfig.messagingSenderId ? '✅ Set' : '❌ Missing',
      appId: localConfig.appId ? '✅ Set' : '❌ Missing',
      measurementId: localConfig.measurementId ? '✅ Set' : '❌ Missing',
    });
    // Cache null to prevent repeated checks
    firebaseClientConfig = null;
    return null;
  }
};

// Log Firebase config status (client-side only, on first load)
if (typeof window !== 'undefined' && !window.__FIREBASE_CONFIG_LOGGED__) {
  window.__FIREBASE_CONFIG_LOGGED__ = true;
  const config = getFirebaseClientConfig();
  if (config) {
    const configStatus = {
      apiKey: config.apiKey ? `✅ Set (length: ${config.apiKey.length})` : '❌ Missing',
      authDomain: config.authDomain ? `✅ Set: ${config.authDomain}` : '❌ Missing',
      projectId: config.projectId ? `✅ Set: ${config.projectId}` : '❌ Missing',
      storageBucket: config.storageBucket ? `✅ Set: ${config.storageBucket}` : '❌ Missing',
      messagingSenderId: config.messagingSenderId ? `✅ Set (length: ${config.messagingSenderId.length})` : '❌ Missing',
      appId: config.appId ? `✅ Set (length: ${config.appId.length})` : '❌ Missing',
      measurementId: config.measurementId ? `✅ Set: ${config.measurementId}` : '❌ Missing',
      source: process.env.FIREBASE_WEBAPP_CONFIG ? 'FIREBASE_WEBAPP_CONFIG' : 'NEXT_PUBLIC_* variables',
    };
    
    console.log('🔍 Firebase Client Config Check:');
    console.log('==========================================');
    Object.entries(configStatus).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });
    console.log(`Config Valid: ✅ Yes`);
    console.log('==========================================');
  } else {
    console.error('[Firebase] ❌ No valid Firebase config available');
  }
}

let appInitAttempted = false; // Track if we've already attempted initialization

export const getFirebaseApp = () => {
  if (appInstance) {
    return appInstance; // Return cached app instance
  }

  const config = getFirebaseClientConfig();
  if (!config) {
    // Only log error once
    if (!appInitAttempted) {
      console.error('[Firebase] ❌ Cannot initialize app: config not available');
      appInitAttempted = true;
    }
    return null;
  }

  appInitAttempted = true;

  // Check if an app is already initialized (e.g., during hot reload in dev)
  if (getApps().length) {
    appInstance = getApp();
  } else {
    appInstance = initializeApp(config);
    console.log('[Firebase] ✅ Client app initialized');
  }

  return appInstance;
};

export const getFirebaseAuth = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  if (!authInstance) {
    authInstance = getAuth(app);
    // Set persistence to survive page refreshes
    setPersistence(authInstance, browserLocalPersistence).catch((error) => {
      console.error('Failed to set auth persistence', error);
    });
  }

  return authInstance;
};

export const getFirebaseDb = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  if (!dbInstance) {
    // Use default database
    const databaseId = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID;
    dbInstance = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  }

  return dbInstance;
};

let analyticsInstance = null;

export const getFirebaseAnalytics = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const app = getFirebaseApp();
  const config = getFirebaseClientConfig();
  if (!app || !config || !config.measurementId) {
    return null;
  }

  if (!analyticsInstance) {
    analyticsInstance = getAnalytics(app);
  }

  return analyticsInstance;
};

