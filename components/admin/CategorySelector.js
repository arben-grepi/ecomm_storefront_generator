'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getStoreCollectionPath } from '@/lib/store-collections';
import CategoryModalButton from '@/components/admin/CreateCategoryButton';

export default function CategorySelector({ value, onChange }) {
  const db = getFirebaseDb();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    const categoriesQuery = query(
      collection(db, ...getStoreCollectionPath('categories')),
      orderBy('name', 'asc')
    );
    const unsubscribe = onSnapshot(
      categoriesQuery,
      (snapshot) => {
        const next = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setCategories(next);
        setLoading(false);
      },
      (error) => {
        console.error('Failed to fetch categories', error);
        setCategories([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db]);

  const activeCategories = useMemo(() => categories.filter((category) => category.active !== false), [categories]);

  const handleCreated = (category) => {
    setCategories((prev) => {
      const exists = prev.some((item) => item.id === category.id);
      if (exists) {
        return prev;
      }
      return [...prev, category];
    });
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
