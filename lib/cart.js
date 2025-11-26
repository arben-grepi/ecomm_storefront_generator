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
    console.log(`[CART] 🛒 useCart: Initializing cart`);
    let unsubscribeAuth;
    let unsubscribeCart;

    const initializeCart = async (currentUser) => {
      console.log(`[CART] 🔐 Cart initialization - User: ${currentUser ? currentUser.email : 'guest'}`);
      setUser(currentUser);

      if (currentUser) {
        // Authenticated: load from Firestore
        console.log(`[CART] 👤 Authenticated user - Loading cart from Firestore (UID: ${currentUser.uid})`);
        const db = getFirebaseDb();
        if (db) {
          const cartRef = doc(db, 'carts', currentUser.uid);
          
          // Get initial cart
          try {
            console.log(`[CART] 📥 Fetching cart from Firestore...`);
            const cartDoc = await getDoc(cartRef);
            if (cartDoc.exists()) {
              const cartData = cartDoc.data();
              const items = cartData.items || [];
              console.log(`[CART] ✅ Cart loaded from Firestore - ${items.length} item(s)`);
              setCart(items);
            } else {
              console.log(`[CART] 📦 No Firestore cart found, checking localStorage for migration...`);
              // Migrate localStorage cart to Firestore if exists
              const localCart = getLocalCart();
              if (localCart.length > 0) {
                console.log(`[CART] 🔄 Migrating ${localCart.length} item(s) from localStorage to Firestore...`);
                try {
                  await setDoc(cartRef, {
                    userId: currentUser.uid,
                    items: localCart,
                    status: 'active',
                    lastUpdated: new Date(),
                  });
                  console.log(`[CART] ✅ Cart migrated to Firestore successfully`);
                  setCart(localCart);
                  localStorage.removeItem(CART_STORAGE_KEY);
                } catch (createError) {
                  console.error(`[CART] ❌ Failed to create cart in Firestore:`, createError);
                  // Fallback to localStorage if create fails
                  console.log(`[CART] ⚠️  Falling back to localStorage`);
                  setCart(localCart);
                }
              } else {
                console.log(`[CART] 📭 No cart items found (new user)`);
                setCart([]);
              }
            }
          } catch (readError) {
            console.error(`[CART] ❌ Failed to read cart from Firestore:`, readError);
            // Fallback to localStorage if read fails
            const localCart = getLocalCart();
            console.log(`[CART] ⚠️  Falling back to localStorage - ${localCart.length} item(s)`);
            setCart(localCart);
          }

          // Subscribe to real-time updates
          console.log(`[CART] 👂 Subscribing to real-time cart updates...`);
          unsubscribeCart = onSnapshot(
            cartRef,
            (snapshot) => {
              if (snapshot.exists()) {
                const cartData = snapshot.data();
                const items = cartData.items || [];
                console.log(`[CART] 📨 Real-time cart update received - ${items.length} item(s)`);
                setCart(items);
              } else {
                console.log(`[CART] 📭 Cart document deleted, clearing cart`);
                setCart([]);
              }
              setLoading(false);
            },
            (error) => {
              // Only log non-permission errors (permission errors are expected for unauthenticated users)
              if (error.code !== 'permission-denied') {
                console.error(`[CART] ❌ Cart subscription error:`, error);
              } else {
                console.log(`[CART] ⚠️  Permission denied (expected for unauthenticated), falling back to localStorage`);
                // Permission denied is expected if user is not authenticated
                // Fallback to localStorage is handled gracefully
                const localCart = getLocalCart();
                setCart(localCart);
              }
              setLoading(false);
            }
          );
        } else {
          console.warn(`[CART] ⚠️  No Firestore DB available`);
          setLoading(false);
        }
      } else {
        // Guest: load from localStorage
        console.log(`[CART] 👻 Guest user - Loading cart from localStorage`);
        const localCart = getLocalCart();
        console.log(`[CART] ✅ Guest cart loaded - ${localCart.length} item(s)`);
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
      const saveStartTime = Date.now();
      console.log(`[CART] 💾 Saving cart - Items: ${newCart.length}, User: ${user ? user.email : 'guest'}`);
      
      setCart(newCart);

      if (user) {
        // Save to Firestore
        const db = getFirebaseDb();
        if (db) {
          const cartRef = doc(db, 'carts', user.uid);
          try {
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
            const duration = Date.now() - saveStartTime;
            console.log(`[CART] ✅ Cart saved to Firestore (${duration}ms)`);
          } catch (error) {
            console.error(`[CART] ❌ Failed to save cart to Firestore:`, error);
            throw error;
          }
        } else {
          console.warn(`[CART] ⚠️  No Firestore DB available, cannot save`);
        }
      } else {
        // Save to localStorage
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(newCart));
            const duration = Date.now() - saveStartTime;
            console.log(`[CART] ✅ Cart saved to localStorage (${duration}ms)`);
          } catch (error) {
            console.error(`[CART] ❌ Failed to save cart to localStorage:`, error);
            throw error;
          }
        }
      }
    },
    [user]
  );

  const addToCart = useCallback(
    async (item) => {
      console.log(`[CART] ➕ Adding to cart - Product: ${item.productName || item.productId}, Variant: ${item.variantId}, Quantity: ${item.quantity}`);
      const addStartTime = Date.now();
      
      const currentCart = user ? cart : getLocalCart();
      const existingIndex = currentCart.findIndex(
        (cartItem) =>
          cartItem.productId === item.productId &&
          cartItem.variantId === item.variantId
      );

      let newCart;
      if (existingIndex >= 0) {
        // Update quantity
        const oldQuantity = currentCart[existingIndex].quantity;
        newCart = [...currentCart];
        newCart[existingIndex].quantity += item.quantity;
        console.log(`[CART] 🔄 Updating existing item quantity: ${oldQuantity} → ${newCart[existingIndex].quantity}`);
      } else {
        // Add new item
        newCart = [...currentCart, item];
        console.log(`[CART] ✨ Adding new item to cart`);
      }

      try {
        await saveCart(newCart);
        const duration = Date.now() - addStartTime;
        console.log(`[CART] ✅ Add to cart complete - Total items: ${newCart.length} (${duration}ms)`);
      } catch (error) {
        console.error(`[CART] ❌ Failed to add to cart:`, error);
        throw error;
      }
    },
    [cart, user, saveCart]
  );

  const removeFromCart = useCallback(
    async (productId, variantId) => {
      console.log(`[CART] ➖ Removing from cart - Product: ${productId}, Variant: ${variantId}`);
      const removeStartTime = Date.now();
      
      const currentCart = user ? cart : getLocalCart();
      const newCart = currentCart.filter(
        (item) => !(item.productId === productId && item.variantId === variantId)
      );
      
      try {
        await saveCart(newCart);
        const duration = Date.now() - removeStartTime;
        console.log(`[CART] ✅ Remove from cart complete - Remaining items: ${newCart.length} (${duration}ms)`);
      } catch (error) {
        console.error(`[CART] ❌ Failed to remove from cart:`, error);
        throw error;
      }
    },
    [cart, user, saveCart]
  );

  const updateQuantity = useCallback(
    async (productId, variantId, quantity) => {
      console.log(`[CART] 🔢 Updating quantity - Product: ${productId}, Variant: ${variantId}, New quantity: ${quantity}`);
      
      if (quantity <= 0) {
        console.log(`[CART] 🗑️  Quantity is 0, removing item instead`);
        await removeFromCart(productId, variantId);
        return;
      }

      const currentCart = user ? cart : getLocalCart();
      const item = currentCart.find(item => item.productId === productId && item.variantId === variantId);
      const oldQuantity = item?.quantity || 0;
      
      const newCart = currentCart.map((item) =>
        item.productId === productId && item.variantId === variantId
          ? { ...item, quantity }
          : item
      );
      
      try {
        await saveCart(newCart);
        console.log(`[CART] ✅ Quantity updated: ${oldQuantity} → ${quantity}`);
      } catch (error) {
        console.error(`[CART] ❌ Failed to update quantity:`, error);
        throw error;
      }
    },
    [cart, user, saveCart, removeFromCart]
  );

  const clearCart = useCallback(async () => {
    console.log(`[CART] 🗑️  Clearing cart`);
    try {
      await saveCart([]);
      console.log(`[CART] ✅ Cart cleared successfully`);
    } catch (error) {
      console.error(`[CART] ❌ Failed to clear cart:`, error);
      throw error;
    }
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

