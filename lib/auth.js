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

// Track if a sign-in is in progress to prevent multiple simultaneous attempts
let signInInProgress = false;

const ensureAuth = () => {
  const auth = getFirebaseAuth();
  if (!auth) {
    console.warn('Firebase authentication is not initialized. Check environment configuration.');
  }
  return auth;
};

export const signInWithGoogle = async () => {
  // Prevent multiple simultaneous sign-in attempts
  if (signInInProgress) {
    devLog(`[AUTH] ⚠️  Sign-in already in progress, ignoring duplicate request`);
    throw new Error('A sign-in request is already in progress. Please wait.');
  }

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

  signInInProgress = true;

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
    
    // Handle specific error codes
    if (error.code === 'auth/popup-blocked') {
      console.warn(`[AUTH] ⚠️  Popup was blocked by browser (${duration}ms). Please allow popups for this site.`);
    } else if (error.code === 'auth/popup-closed-by-user') {
      console.warn(`[AUTH] ⚠️  Popup was closed by user (${duration}ms)`);
    } else if (error.code === 'auth/cancelled-popup-request') {
      console.warn(`[AUTH] ⚠️  Popup request was cancelled - another sign-in may be in progress (${duration}ms)`);
      // This usually means user clicked sign-in multiple times or popup was already open
      // Don't throw error, just log it - the user might have already signed in
    } else {
      console.error(`[AUTH] ❌ Sign in failed (${duration}ms):`, error);
    }
    throw error;
  } finally {
    // Always reset the flag, even if sign-in fails
    signInInProgress = false;
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

