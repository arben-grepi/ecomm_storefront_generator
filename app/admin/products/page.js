'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import Toast from '@/components/admin/Toast';

export default function ProductsListPage() {
  const router = useRouter();
  const db = getFirebaseDb();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'active', 'inactive'
  const [lowStockThreshold, setLowStockThreshold] = useState(10);

  // Fetch categories
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    const categoriesQuery = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const unsubscribeCategories = onSnapshot(
      categoriesQuery,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setCategories(data);
      },
      (error) => {
        console.error('Failed to load categories', error);
      }
    );

    return () => unsubscribeCategories();
  }, [db]);

  // Fetch products with variants
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    const productsQuery = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubscribeProducts = onSnapshot(
      productsQuery,
      async (snapshot) => {
        const productsData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        // Fetch variants for each product to calculate total stock
        const productsWithStock = await Promise.all(
          productsData.map(async (product) => {
            try {
              const variantsSnapshot = await getDocs(collection(db, 'products', product.id, 'variants'));
              const variants = variantsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
              const totalStock = variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
              const lowStockVariants = variants.filter((v) => (v.stock || 0) < lowStockThreshold).length;
              return { ...product, totalStock, variants, lowStockVariants };
            } catch (error) {
              console.warn(`Failed to load variants for product ${product.id}`, error);
              return { ...product, totalStock: 0, variants: [], lowStockVariants: 0 };
            }
          })
        );

        setProducts(productsWithStock);
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load products', error);
        setMessage({ type: 'error', text: 'Failed to load products.' });
        setLoading(false);
      }
    );

    return () => unsubscribeProducts();
  }, [db, lowStockThreshold]);

  // Filter and search products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          product.name?.toLowerCase().includes(query) ||
          product.slug?.toLowerCase().includes(query) ||
          product.description?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (selectedCategory && product.categoryId !== selectedCategory) {
        return false;
      }

      // Active status filter
      if (activeFilter === 'active' && product.active === false) {
        return false;
      }
      if (activeFilter === 'inactive' && product.active !== false) {
        return false;
      }

      return true;
    });
  }, [products, searchQuery, selectedCategory, activeFilter]);

  const handleToggleActive = async (product) => {
    if (!db) {
      return;
    }

    try {
      await updateDoc(doc(db, 'products', product.id), {
        active: product.active === false ? true : false,
        updatedAt: serverTimestamp(),
      });
      setMessage({ type: 'success', text: `Product "${product.name}" ${product.active === false ? 'activated' : 'deactivated'}.` });
    } catch (error) {
      console.error('Failed to update product', error);
      setMessage({ type: 'error', text: 'Failed to update product. Check console for details.' });
    }
  };

  const getCategoryName = (categoryId) => {
    const category = categories.find((cat) => cat.id === categoryId);
    return category?.name || '—';
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <button
          onClick={() => router.push('/admin/overview')}
          className="text-sm font-medium text-emerald-600 transition hover:text-emerald-500"
        >
          ← Back to admin
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-900">Products</h1>
            <p className="text-base text-zinc-500">
              Manage your product catalog, inventory, and pricing.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/plans/products"
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
            >
              View plan
            </Link>
            <Link
              href="/admin/products/new"
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
            >
              + New product
            </Link>
          </div>
        </div>
      </header>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      {/* Filters */}
      <section className="space-y-4 rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Search */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-600">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, slug, or description..."
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>

          {/* Category filter */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-600">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            >
              <option value="">All categories</option>
              {categories
                .filter((cat) => cat.active !== false)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Active status filter */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-zinc-600">Status</label>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            >
              <option value="all">All products</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
          <p className="text-sm text-zinc-500">
            Showing {filteredProducts.length} of {products.length} products
          </p>
          {filteredProducts.some((p) => p.lowStockVariants > 0) && (
            <p className="text-sm font-medium text-rose-600">
              ⚠️ {filteredProducts.filter((p) => p.lowStockVariants > 0).length} product(s) with low stock
            </p>
          )}
        </div>
      </section>

      {/* Products table */}
      <section className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-sm">
        {loading ? (
          <div className="px-4 py-10 text-center text-zinc-400">Loading products...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="px-4 py-10 text-center text-zinc-400">
            {searchQuery || selectedCategory || activeFilter !== 'all' ? 'No products match your filters.' : 'No products yet. Create your first product to get started.'}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-zinc-100 bg-white text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Product</th>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-left font-medium">Price</th>
                <th className="px-4 py-3 text-left font-medium">Stock</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Views</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredProducts.map((product) => {
                const hasLowStock = product.lowStockVariants > 0;
                const hasImage = product.images && product.images.length > 0 && product.images[0];

                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-zinc-50/80 transition ${
                      hasLowStock ? 'bg-rose-50/30' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                          {hasImage ? (
                            <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <svg
                                className="h-6 w-6 text-zinc-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <Link
                            href={`/admin/products/${product.id}/edit`}
                            className="font-medium text-zinc-800 hover:text-emerald-600 transition"
                          >
                            {product.name}
                          </Link>
                          <span className="text-xs text-zinc-400">{product.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{getCategoryName(product.categoryId)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-zinc-800">€{product.basePrice?.toFixed(2) || '0.00'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className={`font-medium ${product.totalStock === 0 ? 'text-rose-600' : hasLowStock ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {product.totalStock}
                        </span>
                        {hasLowStock && (
                          <span className="text-xs text-rose-500">
                            {product.lowStockVariants} variant{product.lowStockVariants !== 1 ? 's' : ''} low
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          product.active === false
                            ? 'bg-rose-100 text-rose-600'
                            : 'bg-emerald-100 text-emerald-600'
                        }`}
                      >
                        {product.active === false ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {product.metrics?.totalViews || 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/products/${product.id}/edit`}
                          className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(product)}
                          className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                        >
                          {product.active === false ? 'Activate' : 'Deactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

