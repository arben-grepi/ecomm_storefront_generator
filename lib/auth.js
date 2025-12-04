'use client';

import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';
import { devLog } from './dev-log';

const provider = new GoogleAuthProvider();

const ensureAuth = () => {
  const auth = getFirebaseAuth();
  if (!auth) {
    console.warn('Firebase authentication is not initialized. Check environment configuration.');
  }
  return auth;
};

export const signInWithGoogle = async () => {
  devLog(`[AUTH] 🔐 Sign in with Google: Starting...`);
  const signInStartTime = Date.now();
  
  const auth = ensureAuth();
  if (!auth) {
    const error = new Error('Firebase authentication is not initialized.');
    console.error(`[AUTH] ❌ ${error.message}`);
    throw error;
  }

  // Double-check auth is valid before using it
  if (typeof auth === 'undefined' || auth === null) {
    const error = new Error('Firebase auth instance is invalid.');
    console.error(`[AUTH] ❌ ${error.message}`);
    throw error;
  }

  try {
    // Use popup for sign-in
    devLog(`[AUTH] 🔄 Opening Google sign-in popup...`);
    const result = await signInWithPopup(auth, provider);
    const duration = Date.now() - signInStartTime;
    // Don't log email/UID for security (GDPR/compliance)
    devLog(`[AUTH] ✅ Sign in successful (${duration}ms)`);
    return result.user;
  } catch (error) {
    const duration = Date.now() - signInStartTime;
    // If popup is blocked or fails, log but don't throw (user might have blocked popups)
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
      console.warn(`[AUTH] ⚠️  Popup was blocked or closed (${duration}ms)`);
    } else {
      console.error(`[AUTH] ❌ Sign in failed (${duration}ms):`, error);
    }
    throw error;
  }
};

export const signOutUser = async () => {
  devLog(`[AUTH] 🚪 Sign out: Starting...`);
  const signOutStartTime = Date.now();
  
  const auth = ensureAuth();
  if (!auth) {
    console.error(`[AUTH] ❌ Firebase authentication is not initialized`);
    throw new Error('Firebase authentication is not initialized.');
  }

  try {
    await signOut(auth);
    const duration = Date.now() - signOutStartTime;
    // Don't log email for security (GDPR/compliance)
    devLog(`[AUTH] ✅ Sign out successful (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - signOutStartTime;
    console.error(`[AUTH] ❌ Sign out failed (${duration}ms):`, error);
    throw error;
  }
};

export const subscribeToAuth = (callback) => {
  devLog(`[AUTH] 👂 Subscribing to auth state changes...`);
  const auth = ensureAuth();
  if (!auth) {
    console.warn(`[AUTH] ⚠️  No auth available, calling callback with null`);
    callback(null);
    return () => {};
  }

  const unsubscribe = firebaseOnAuthStateChanged(auth, (user) => {
    if (user) {
      // Don't log email/UID for security (GDPR/compliance)
      devLog(`[AUTH] 🔄 Auth state changed - User signed in`);
    } else {
      devLog(`[AUTH] 🔄 Auth state changed - User signed out`);
    }
    callback(user);
  });
  
  devLog(`[AUTH] ✅ Auth subscription active`);
  return unsubscribe;
};

export const isAdmin = (email) =>
  ['arbengrepi@gmail.com', 'andreas.konga@gmail.com', 'muliqiblerine@gmail.com'].includes(email);

