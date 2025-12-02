'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getCollectionPath } from '@/lib/store-collections';
import { useWebsite } from '@/lib/website-context';
import CategoryModalButton from '@/components/admin/CreateCategoryButton';

export default function CategorySelector({ value, onChange, storefronts }) {
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [categoriesByStorefront, setCategoriesByStorefront] = useState({});
  const [loading, setLoading] = useState(true);

  // Determine which storefronts to load categories from
  const storefrontsToLoad = useMemo(() => {
    if (storefronts && Array.isArray(storefronts) && storefronts.length > 0) {
      return storefronts;
    }
    return selectedWebsite ? [selectedWebsite] : [];
  }, [storefronts, selectedWebsite]);

  // Merge categories from all storefronts
  const categories = useMemo(() => {
    const mergedMap = new Map();
    Object.values(categoriesByStorefront).forEach((cats) => {
      if (Array.isArray(cats)) {
        cats.forEach((cat) => {
          if (!mergedMap.has(cat.id)) {
            mergedMap.set(cat.id, cat);
          }
        });
      }
    });
    return Array.from(mergedMap.values()).sort((a, b) => 
      (a.name || '').localeCompare(b.name || '')
    );
  }, [categoriesByStorefront]);

  // Track loading state based on whether all storefronts have data
  useEffect(() => {
    if (storefrontsToLoad.length === 0) {
      setLoading(false);
      return;
    }
    
    // Check if all storefronts have loaded (have entries in categoriesByStorefront)
    const allLoaded = storefrontsToLoad.every((storefront) => 
      storefront in categoriesByStorefront
    );
    
    if (allLoaded && loading) {
      setLoading(false);
    }
  }, [categoriesByStorefront, storefrontsToLoad, loading]);

  useEffect(() => {
    if (!db || storefrontsToLoad.length === 0) {
      setLoading(false);
      setCategoriesByStorefront({});
      return undefined;
    }

    setLoading(true);
    // Clear previous data for storefronts that are no longer in the list
    setCategoriesByStorefront((prev) => {
      const updated = { ...prev };
      // Remove entries for storefronts not in storefrontsToLoad
      Object.keys(updated).forEach((sf) => {
        if (!storefrontsToLoad.includes(sf)) {
          delete updated[sf];
        }
      });
      return updated;
    });
    
    const unsubscribes = storefrontsToLoad.map((storefront) => {
      const categoriesQuery = query(
        collection(db, ...getCollectionPath('categories', storefront)),
        orderBy('name', 'asc')
      );
      return onSnapshot(
        categoriesQuery,
        (snapshot) => {
          const storefrontCategories = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          
          setCategoriesByStorefront((prev) => ({
            ...prev,
            [storefront]: storefrontCategories,
          }));
        },
        (error) => {
          console.error(`[CategorySelector] ❌ Failed to fetch categories from "${storefront}"`, error);
          setCategoriesByStorefront((prev) => ({
            ...prev,
            [storefront]: [],
          }));
        }
      );
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [db, storefrontsToLoad.join(',')]); // Use join to create stable dependency

  const activeCategories = useMemo(() => categories.filter((category) => category.active !== false), [categories]);

  const handleCreated = (category) => {
    // Add the new category to all storefronts it belongs to
    if (category.storefronts && Array.isArray(category.storefronts)) {
      setCategoriesByStorefront((prev) => {
        const updated = { ...prev };
        category.storefronts.forEach((storefront) => {
          if (!updated[storefront]) {
            updated[storefront] = [];
          }
          // Check if category already exists in this storefront
          const exists = updated[storefront].some((item) => item.id === category.id);
          if (!exists) {
            updated[storefront] = [...updated[storefront], category];
          }
        });
        return updated;
      });
    } else {
      // Fallback: add to the first storefront in storefrontsToLoad
      if (storefrontsToLoad.length > 0) {
        const firstStorefront = storefrontsToLoad[0];
        setCategoriesByStorefront((prev) => {
          const updated = { ...prev };
          if (!updated[firstStorefront]) {
            updated[firstStorefront] = [];
          }
          const exists = updated[firstStorefront].some((item) => item.id === category.id);
          if (!exists) {
            updated[firstStorefront] = [...updated[firstStorefront], category];
          }
          return updated;
        });
      }
    }
    if (onChange) {
      onChange(category.id);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <select
        value={value || ''}
        onChange={(event) => onChange && onChange(event.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 disabled:text-zinc-400 dark:disabled:text-zinc-500"
        disabled={loading || !db}
        required
      >
        <option value="" disabled>
          {loading ? 'Loading categories…' : 'Select category'}
        </option>
        {activeCategories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      {db ? (
        <div className="relative group">
          <CategoryModalButton
            triggerLabel=""
            onCompleted={handleCreated}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200/70 text-zinc-500 transition hover:border-emerald-200 hover:bg-emerald-50/50 hover:text-emerald-600"
          />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
            Create a new category
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-900" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
