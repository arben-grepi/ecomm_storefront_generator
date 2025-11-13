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
  const auth = ensureAuth();
  if (!auth) {
    throw new Error('Firebase authentication is not initialized.');
  }

  try {
    // Use redirect instead of popup to avoid COOP policy warnings
    // This is more reliable across different browsers
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    // If popup is blocked or fails, log but don't throw (user might have blocked popups)
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
      console.warn('Popup was blocked or closed. Consider using redirect sign-in instead.');
    }
    console.error('Error signing in:', error);
    throw error;
  }
};

export const signOutUser = async () => {
  const auth = ensureAuth();
  if (!auth) {
    throw new Error('Firebase authentication is not initialized.');
  }

  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const subscribeToAuth = (callback) => {
  const auth = ensureAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }

  const unsubscribe = firebaseOnAuthStateChanged(auth, callback);
  return unsubscribe;
};

export const isAdmin = (email) =>
  ['arbengrepi@gmail.com', 'andreas.konga@gmail.com', 'muliqiblerine@gmail.com'].includes(email);

