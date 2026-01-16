'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getCollectionPath } from '@/lib/store-collections';
import { useWebsite } from '@/lib/website-context';
import CategoryModalButton from '@/components/admin/CreateCategoryButton';

export default function MultiCategorySelector({ value = [], onChange, storefronts }) {
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [categoriesByStorefront, setCategoriesByStorefront] = useState({});
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  // Ensure value is always an array
  const selectedCategoryIds = Array.isArray(value) ? value : (value ? [value] : []);

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
          console.error(`[MultiCategorySelector] ❌ Failed to fetch categories from "${storefront}"`, error);
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

  const handleToggleCategory = (categoryId) => {
    const newSelection = selectedCategoryIds.includes(categoryId)
      ? selectedCategoryIds.filter(id => id !== categoryId)
      : [...selectedCategoryIds, categoryId];
    
    if (onChange) {
      onChange(newSelection);
    }
  };

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
    // Auto-select the newly created category
    if (onChange && !selectedCategoryIds.includes(category.id)) {
      onChange([...selectedCategoryIds, category.id]);
    }
  };

  const selectedCategories = useMemo(() => {
    return activeCategories.filter(cat => selectedCategoryIds.includes(cat.id));
  }, [activeCategories, selectedCategoryIds]);

  return (
    <div className="relative">
      {/* Selected categories display / Dropdown trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 disabled:text-zinc-400 dark:disabled:text-zinc-500 flex items-center justify-between"
        disabled={loading || !db}
      >
        <span className="text-left flex-1">
          {loading ? (
            'Loading categories…'
          ) : selectedCategories.length === 0 ? (
            <span className="text-zinc-400">Select categories</span>
          ) : selectedCategories.length === 1 ? (
            selectedCategories[0].name
          ) : (
            `${selectedCategories.length} categories selected`
          )}
        </span>
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && !loading && db && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900 max-h-64 overflow-y-auto">
          <div className="p-2 space-y-1">
            {activeCategories.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">No categories available</div>
            ) : (
              activeCategories.map((category) => {
                const isSelected = selectedCategoryIds.includes(category.id);
                return (
                  <label
                    key={category.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleCategory(category.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-zinc-800 dark:text-zinc-100 flex-1">
                      {category.name}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          {db && (
            <div className="border-t border-zinc-200 dark:border-zinc-700 p-2">
              <CategoryModalButton
                triggerLabel="Create new category"
                onCompleted={handleCreated}
                className="w-full text-left px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md transition-colors"
              />
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Selected categories chips (below dropdown) */}
      {selectedCategories.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedCategories.map((category) => (
            <span
              key={category.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
            >
              {category.name}
              <button
                type="button"
                onClick={() => handleToggleCategory(category.id)}
                className="hover:text-emerald-900 dark:hover:text-emerald-200"
                aria-label={`Remove ${category.name}`}
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

