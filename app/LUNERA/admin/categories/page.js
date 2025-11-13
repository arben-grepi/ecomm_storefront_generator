'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import CategoryModalButton from '@/components/admin/CreateCategoryButton';
import CategoryTable from '@/components/admin/CategoryTable';
import Toast from '@/components/admin/Toast';
import { getStoreCollectionPath, getStoreDocPath } from '@/lib/store-collections';

export default function CategoriesAdminPage() {
  const router = useRouter();
  const db = getFirebaseDb();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const visibleCategories = useMemo(() => categories.filter((cat) => cat.active !== false), [categories]);
  const hiddenCategories = useMemo(() => categories.filter((cat) => cat.active === false), [categories]);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    const categoriesQuery = query(
      collection(db, ...getStoreCollectionPath('categories')),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeCategories = onSnapshot(
      categoriesQuery,
      (snapshot) => {
        const data = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }));
        setCategories(data);
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load categories', error);
        setMessage({ type: 'error', text: 'Failed to load categories.' });
        setLoading(false);
      }
    );

    // Also fetch products to show in expandable sections
    // Filter active products client-side
    const productsQuery = query(collection(db, ...getStoreCollectionPath('products')));
    const unsubscribeProducts = onSnapshot(
      productsQuery,
      async (snapshot) => {
        const productsData = snapshot.docs
          .map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }))
          .filter((product) => product.active !== false);

        // Fetch variants for each product to calculate total stock
        const productsWithStock = await Promise.all(
          productsData.map(async (product) => {
            try {
              const variantsSnapshot = await getDocs(
                collection(db, ...getStoreDocPath('products', product.id), 'variants')
              );
              const variants = variantsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
              const totalStock = variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
              return { ...product, totalStock, variants };
            } catch (error) {
              console.warn(`Failed to load variants for product ${product.id}`, error);
              return { ...product, totalStock: 0, variants: [] };
            }
          })
        );

        setProducts(productsWithStock);
      },
      (error) => {
        // Silently fail - products are optional for this page
        console.warn('Failed to load products', error);
      }
    );

    return () => {
      unsubscribeCategories();
      unsubscribeProducts();
    };
  }, [db]);

  const toggleExpanded = (categoryId) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const getCategoryProducts = (categoryId) => {
    return products.filter((product) => product.categoryId === categoryId);
  };

  const handleToggleActive = async (category) => {
    if (!db) {
      return;
    }

    try {
      await updateDoc(doc(db, ...getStoreDocPath('categories', category.id)), {
        active: category.active === false ? true : false,
        updatedAt: serverTimestamp(),
      });
      setMessage({ type: 'success', text: `Category "${category.name}" updated.` });
    } catch (error) {
      console.error('Failed to update category', error);
      setMessage({ type: 'error', text: 'Failed to update category. Check console for details.' });
    }
  };

  const handleUpdatePreviewProducts = async (categoryId, previewProductIds) => {
    if (!db) {
      return;
    }

    try {
      await updateDoc(doc(db, ...getStoreDocPath('categories', categoryId)), {
        previewProductIds: previewProductIds.slice(0, 4), // Max 4 products
        updatedAt: serverTimestamp(),
      });
      setMessage({ type: 'success', text: 'Preview products updated.' });
    } catch (error) {
      console.error('Failed to update preview products', error);
      setMessage({ type: 'error', text: 'Failed to update preview products. Check console for details.' });
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <button
          onClick={() => router.push('/LUNERA/admin/overview')}
          className="text-sm font-medium text-emerald-600 transition hover:text-emerald-500"
        >
          ← Back to admin
        </button>
        <h1 className="text-3xl font-semibold text-zinc-900">Manage categories</h1>
        <p className="text-base text-zinc-500">
          Create, hide, or inspect categories. Hidden categories remain in the database but aren’t shown when adding new
          products.
        </p>
        {db ? (
          <CategoryModalButton
            onCompleted={(category) => {
              setMessage({ type: 'success', text: `Category "${category.name}" created successfully.` });
            }}
          />
        ) : null}
      </header>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      {/* Visible Categories */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-800">Visible Categories</h2>
        <div className="overflow-hidden rounded-3xl border border-zinc-200/70">
          <CategoryTable
            categories={visibleCategories}
            loading={loading}
            onToggleExpanded={toggleExpanded}
            expandedCategories={expandedCategories}
            getCategoryProducts={getCategoryProducts}
            onToggleActive={handleToggleActive}
            onUpdatePreviewProducts={handleUpdatePreviewProducts}
            db={db}
            setMessage={setMessage}
          />
        </div>
      </section>

      {/* Hidden Categories */}
      {hiddenCategories.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-800">Hidden Categories</h2>
          <div className="overflow-hidden rounded-3xl border border-zinc-200/70">
            <CategoryTable
              categories={hiddenCategories}
              loading={false}
              onToggleExpanded={toggleExpanded}
              expandedCategories={expandedCategories}
              getCategoryProducts={getCategoryProducts}
              onToggleActive={handleToggleActive}
              onUpdatePreviewProducts={handleUpdatePreviewProducts}
              db={db}
              setMessage={setMessage}
            />
          </div>
        </section>
      )}
    </div>
  );
}
