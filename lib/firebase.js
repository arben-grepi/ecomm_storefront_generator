'use client';

import { getApps, initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBL2gnh-jO_47zTKgT05PaMwqGCK9hJIKA',
  authDomain: 'ecommerce-2f366.firebaseapp.com',
  projectId: 'ecommerce-2f366',
  storageBucket: 'ecommerce-2f366.firebasestorage.app',
  messagingSenderId: '180795445013',
  appId: '1:180795445013:web:7ef14a09f0398a343a231c',
  measurementId: 'G-G6C5N0K2DX',
};

const isConfigValid = Object.values({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  appId: firebaseConfig.appId,
}).every(Boolean);

let appInstance = null;
let authInstance = null;
let dbInstance = null;

export const getFirebaseApp = () => {
  if (!isConfigValid) {
    return null;
  }

  if (appInstance) {
    return appInstance;
  }

  if (!getApps().length) {
    appInstance = initializeApp(firebaseConfig);
  } else {
    appInstance = getApps()[0];
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
    dbInstance = getFirestore(app);
  }

  return dbInstance;
};

let analyticsInstance = null;

export const getFirebaseAnalytics = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const app = getFirebaseApp();
  if (!app || !firebaseConfig.measurementId) {
    return null;
  }

  if (!analyticsInstance) {
    analyticsInstance = getAnalytics(app);
  }

  return analyticsInstance;
};

