'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { getStoreCollectionPath } from './store-collections';
import { useWebsite } from './website-context';

// Transform Firestore category to e-commerce format
const transformCategory = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    value: doc.id, // Use document ID as value for routing
    label: data.name || '',
    description: data.description || '',
    imageUrl: data.imageUrl || null,
    slug: data.slug || doc.id,
    active: data.active !== false,
    previewProductIds: data.previewProductIds || [],
  };
};

// Transform Firestore product to e-commerce format
const transformProduct = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name || '',
    slug: data.slug || doc.id,
    price: data.basePrice || 0,
    image: data.images && data.images.length > 0 ? data.images[0] : null,
    category: data.categoryId || '', // This will be the category document ID
    categoryId: data.categoryId || '',
    description: data.description || '',
    descriptionHtml: data.descriptionHtml || null,
    extraImages: Array.isArray(data.extraImages) ? data.extraImages.filter(Boolean) : [],
    specs: data.specs || null,
    active: data.active !== false,
    metrics: data.metrics || { totalViews: 0, totalPurchases: 0 },
    createdAt: data.createdAt || null,
  };
};

// Fetch active categories
export const useCategories = () => {
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    // Fetch all categories and filter active ones client-side
    // (Firestore doesn't support != false queries efficiently)
    const categoriesQuery = query(
      collection(db, ...getStoreCollectionPath('categories', selectedWebsite)),
      orderBy('name', 'asc')
    );

    const unsubscribe = onSnapshot(
      categoriesQuery,
      (snapshot) => {
        const transformed = snapshot.docs
          .map(transformCategory)
          .filter((cat) => cat.active);
        setCategories(transformed);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Failed to fetch categories', err);
        setError(err);
        setCategories([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db, selectedWebsite]);

  return { categories, loading, error };
};

// Fetch products by category ID
export const useProductsByCategory = (categoryId) => {
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    if (!categoryId) {
      setProducts([]);
      setLoading(false);
      return undefined;
    }

    // Query products by category, filter active client-side
    // Sort client-side to avoid needing composite index
    const productsQuery = query(
      collection(db, ...getStoreCollectionPath('products', selectedWebsite)),
      where('categoryId', '==', categoryId)
    );

    const unsubscribe = onSnapshot(
      productsQuery,
      (snapshot) => {
        const transformed = snapshot.docs
          .map(transformProduct)
          .filter((prod) => prod.active)
          .sort((a, b) => {
            // Sort by createdAt if available, otherwise by name
            const aCreated = a.createdAt?.toMillis?.() || 0;
            const bCreated = b.createdAt?.toMillis?.() || 0;
            if (aCreated && bCreated) {
              return bCreated - aCreated; // Newest first
            }
            return (a.name || '').localeCompare(b.name || '');
          });
        setProducts(transformed);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Failed to fetch products', err);
        setError(err);
        setProducts([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db, categoryId, selectedWebsite]);

  return { products, loading, error };
};

// Fetch all active products
export const useAllProducts = () => {
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    // Fetch all products, filter active client-side
    // Sort client-side to avoid needing composite index
    const productsQuery = query(collection(db, ...getStoreCollectionPath('products', selectedWebsite)));

    const unsubscribe = onSnapshot(
      productsQuery,
      (snapshot) => {
        const transformed = snapshot.docs
          .map(transformProduct)
          .filter((prod) => prod.active)
          .sort((a, b) => {
            // Sort by createdAt if available, otherwise by name
            const aCreated = a.createdAt?.toMillis?.() || 0;
            const bCreated = b.createdAt?.toMillis?.() || 0;
            if (aCreated && bCreated) {
              return bCreated - aCreated; // Newest first
            }
            return (a.name || '').localeCompare(b.name || '');
          });
        setProducts(transformed);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Failed to fetch products', err);
        setError(err);
        setProducts([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db, selectedWebsite]);

  return { products, loading, error };
};

// Get top products for a category (for homepage previews)
export const useTopProductsByCategory = (categoryId, limit = 4) => {
  const { products, loading, error } = useProductsByCategory(categoryId);
  const topProducts = useMemo(() => {
    // Sort by metrics.totalViews or createdAt, then take top N
    return products
      .sort((a, b) => {
        const aViews = a.metrics?.totalViews || 0;
        const bViews = b.metrics?.totalViews || 0;
        return bViews - aViews;
      })
      .slice(0, limit);
  }, [products, limit]);

  return { products: topProducts, loading, error };
};

