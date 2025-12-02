'use client';

import { getApps, initializeApp, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

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

// Firebase config status logging removed - config is validated internally
// If config is invalid, errors will be logged when trying to initialize the app

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
    
    // Enable offline persistence (IndexedDB)
    // This caches Firestore data locally for offline access and faster subsequent loads
    enableIndexedDbPersistence(dbInstance).catch((error) => {
      // Handle persistence errors gracefully
      if (error.code === 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a time
        console.warn('[Firebase] ⚠️  Offline persistence already enabled in another tab');
      } else if (error.code === 'unimplemented') {
        // Browser doesn't support IndexedDB persistence
        console.warn('[Firebase] ⚠️  Browser does not support offline persistence');
      } else {
        console.error('[Firebase] ❌ Failed to enable offline persistence:', error);
      }
    });
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

