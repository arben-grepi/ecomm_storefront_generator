'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFirebaseDb } from './firebase';
import { collection, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { subscribeToAuth } from './auth';

const CART_STORAGE_KEY = 'ecommerce_cart';
const STOCK_CACHE_KEY = 'ecommerce_stock_cache';
const STOCK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Stock cache helper
export const getStockCache = () => {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(STOCK_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > STOCK_CACHE_TTL) {
      localStorage.removeItem(STOCK_CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

export const setStockCache = (stockData) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      STOCK_CACHE_KEY,
      JSON.stringify({
        data: stockData,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    console.error('Failed to cache stock data:', error);
  }
};

// Cart item structure: { productId, variantId, quantity, priceAtAdd, productName, variantName, image }
export const useCart = () => {
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const getLocalCart = () => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  // Load cart from localStorage or Firestore
  useEffect(() => {
    let unsubscribeAuth;
    let unsubscribeCart;

    const initializeCart = async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        // Authenticated: load from Firestore
        const db = getFirebaseDb();
        if (db) {
          const cartRef = doc(db, 'carts', currentUser.uid);
          
          // Get initial cart
          try {
            const cartDoc = await getDoc(cartRef);
            if (cartDoc.exists()) {
              const cartData = cartDoc.data();
              setCart(cartData.items || []);
            } else {
              // Migrate localStorage cart to Firestore if exists
              const localCart = getLocalCart();
              if (localCart.length > 0) {
                try {
                  await setDoc(cartRef, {
                    userId: currentUser.uid,
                    items: localCart,
                    status: 'active',
                    lastUpdated: new Date(),
                  });
                  setCart(localCart);
                  localStorage.removeItem(CART_STORAGE_KEY);
                } catch (createError) {
                  console.error('Failed to create cart in Firestore:', createError);
                  // Fallback to localStorage if create fails
                  setCart(localCart);
                }
              } else {
                setCart([]);
              }
            }
          } catch (readError) {
            console.error('Failed to read cart from Firestore:', readError);
            // Fallback to localStorage if read fails
            const localCart = getLocalCart();
            setCart(localCart);
          }

          // Subscribe to real-time updates
          unsubscribeCart = onSnapshot(
            cartRef,
            (snapshot) => {
              if (snapshot.exists()) {
                const cartData = snapshot.data();
                setCart(cartData.items || []);
              } else {
                setCart([]);
              }
              setLoading(false);
            },
            (error) => {
              // Only log non-permission errors (permission errors are expected for unauthenticated users)
              if (error.code !== 'permission-denied') {
                console.error('Cart subscription error:', error);
              } else {
                // Permission denied is expected if user is not authenticated
                // Fallback to localStorage is handled gracefully
                const localCart = getLocalCart();
                setCart(localCart);
              }
              setLoading(false);
            }
          );
        } else {
          setLoading(false);
        }
      } else {
        // Guest: load from localStorage
        const localCart = getLocalCart();
        setCart(localCart);
        setLoading(false);
      }
    };

    unsubscribeAuth = subscribeToAuth(initializeCart);

    return () => {
      if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
      if (typeof unsubscribeCart === 'function') unsubscribeCart();
    };
  }, []);

  const saveCart = useCallback(
    async (newCart) => {
      setCart(newCart);

      if (user) {
        // Save to Firestore
        const db = getFirebaseDb();
        if (db) {
          const cartRef = doc(db, 'carts', user.uid);
          await setDoc(
            cartRef,
            {
              userId: user.uid,
              items: newCart,
              status: 'active',
              lastUpdated: new Date(),
            },
            { merge: true }
          );
        }
      } else {
        // Save to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(newCart));
        }
      }
    },
    [user]
  );

  const addToCart = useCallback(
    async (item) => {
      const currentCart = user ? cart : getLocalCart();
      const existingIndex = currentCart.findIndex(
        (cartItem) =>
          cartItem.productId === item.productId &&
          cartItem.variantId === item.variantId
      );

      let newCart;
      if (existingIndex >= 0) {
        // Update quantity
        newCart = [...currentCart];
        newCart[existingIndex].quantity += item.quantity;
      } else {
        // Add new item
        newCart = [...currentCart, item];
      }

      await saveCart(newCart);
    },
    [cart, user, saveCart]
  );

  const removeFromCart = useCallback(
    async (productId, variantId) => {
      const currentCart = user ? cart : getLocalCart();
      const newCart = currentCart.filter(
        (item) => !(item.productId === productId && item.variantId === variantId)
      );
      await saveCart(newCart);
    },
    [cart, user, saveCart]
  );

  const updateQuantity = useCallback(
    async (productId, variantId, quantity) => {
      if (quantity <= 0) {
        await removeFromCart(productId, variantId);
        return;
      }

      const currentCart = user ? cart : getLocalCart();
      const newCart = currentCart.map((item) =>
        item.productId === productId && item.variantId === variantId
          ? { ...item, quantity }
          : item
      );
      await saveCart(newCart);
    },
    [cart, user, saveCart, removeFromCart]
  );

  const clearCart = useCallback(async () => {
    await saveCart([]);
  }, [saveCart]);

  const getCartTotal = useCallback(() => {
    const currentCart = user ? cart : getLocalCart();
    return currentCart.reduce((total, item) => {
      return total + (item.priceAtAdd || 0) * item.quantity;
    }, 0);
  }, [cart, user]);

  const getCartItemCount = useCallback(() => {
    const currentCart = user ? cart : getLocalCart();
    return currentCart.reduce((count, item) => count + item.quantity, 0);
  }, [cart, user]);

  return {
    cart: user ? cart : getLocalCart(),
    loading,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
    getCartItemCount,
  };
};

