'use client';

import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

const provider = new GoogleAuthProvider();

const ensureAuth = () => {
  const auth = getFirebaseAuth();
  if (!auth) {
    console.warn('Firebase authentication is not initialized. Check environment configuration.');
  }
  return auth;
};

export const signInWithGoogle = async () => {
  console.log(`[AUTH] 🔐 Sign in with Google: Starting...`);
  const signInStartTime = Date.now();
  
  const auth = ensureAuth();
  if (!auth) {
    console.error(`[AUTH] ❌ Firebase authentication is not initialized`);
    throw new Error('Firebase authentication is not initialized.');
  }

  try {
    // Use redirect instead of popup to avoid COOP policy warnings
    // This is more reliable across different browsers
    console.log(`[AUTH] 🔄 Opening Google sign-in popup...`);
    const result = await signInWithPopup(auth, provider);
    const duration = Date.now() - signInStartTime;
    console.log(`[AUTH] ✅ Sign in successful - User: ${result.user.email}, UID: ${result.user.uid} (${duration}ms)`);
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
  console.log(`[AUTH] 🚪 Sign out: Starting...`);
  const signOutStartTime = Date.now();
  
  const auth = ensureAuth();
  if (!auth) {
    console.error(`[AUTH] ❌ Firebase authentication is not initialized`);
    throw new Error('Firebase authentication is not initialized.');
  }

  try {
    const currentUser = auth.currentUser;
    const userEmail = currentUser?.email || 'unknown';
    await signOut(auth);
    const duration = Date.now() - signOutStartTime;
    console.log(`[AUTH] ✅ Sign out successful - User: ${userEmail} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - signOutStartTime;
    console.error(`[AUTH] ❌ Sign out failed (${duration}ms):`, error);
    throw error;
  }
};

export const subscribeToAuth = (callback) => {
  console.log(`[AUTH] 👂 Subscribing to auth state changes...`);
  const auth = ensureAuth();
  if (!auth) {
    console.warn(`[AUTH] ⚠️  No auth available, calling callback with null`);
    callback(null);
    return () => {};
  }

  const unsubscribe = firebaseOnAuthStateChanged(auth, (user) => {
    if (user) {
      console.log(`[AUTH] 🔄 Auth state changed - User signed in: ${user.email} (UID: ${user.uid})`);
    } else {
      console.log(`[AUTH] 🔄 Auth state changed - User signed out`);
    }
    callback(user);
  });
  
  console.log(`[AUTH] ✅ Auth subscription active`);
  return unsubscribe;
};

export const isAdmin = (email) =>
  ['arbengrepi@gmail.com', 'andreas.konga@gmail.com', 'muliqiblerine@gmail.com'].includes(email);

