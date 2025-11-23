'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getCollectionPath } from '@/lib/store-collections';
import ShopifyItemModal from '@/components/admin/ShopifyItemModal';
import { useWebsite } from '@/lib/website-context';

export default function ShopifyItemsPage() {
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMarket, setSelectedMarket] = useState('all'); // 'all' | 'FI' | 'DE' | etc.

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    loadShopifyItems();
  }, [db]);

  const loadShopifyItems = async () => {
    if (!db) return;

    try {
      const itemsQuery = query(
        collection(db, ...getCollectionPath('shopifyItems')),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(itemsQuery);
      const itemsData = snapshot.docs.map((doc) => {
        const data = doc.data();
        console.log(`📦 Loaded Shopify item: ${doc.id}`, {
          title: data.title,
          imageUrls: data.imageUrls,
          images: data.images,
          rawProduct: data.rawProduct ? 'exists' : 'missing',
          variants: data.variants,
          rawProductVariants: data.rawProduct?.variants?.length || 0,
        });
        return {
          id: doc.id,
          ...data,
          processedForStorefront: Array.isArray(data.processedStorefronts)
            ? data.processedStorefronts.includes(selectedWebsite)
            : false,
        };
      });
      console.log(`✅ Loaded ${itemsData.length} Shopify items total`);
      setItems(itemsData);
    } catch (error) {
      console.error('❌ Failed to load Shopify items:', error);
    } finally {
      setLoading(false);
    }
  };

  // Extract available markets from items
  const availableMarkets = useMemo(() => {
    const markets = new Set();
    items.forEach((item) => {
      if (item.marketsObject && typeof item.marketsObject === 'object') {
        Object.keys(item.marketsObject).forEach((market) => markets.add(market));
      } else if (Array.isArray(item.markets)) {
        item.markets.forEach((market) => markets.add(market));
      }
    });
    return Array.from(markets).sort();
  }, [items]);

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) =>
          item.title?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .filter((item) => {
          // Market filter
          if (selectedMarket === 'all') return true;
          
          // Check marketsObject first (new format)
          if (item.marketsObject && typeof item.marketsObject === 'object') {
            return item.marketsObject[selectedMarket]?.available !== false;
          }
          
          // Fallback to markets array (legacy format)
          if (Array.isArray(item.markets)) {
            return item.markets.includes(selectedMarket);
          }
          
          return false;
        })
        .filter((item) => !item.processedForStorefront),
    [items, searchTerm, selectedMarket]
  );

  const getStatusBadge = (item) => {
    if (item.processedForStorefront) {
      return (
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          Processed
        </span>
      );
    }
    return (
      <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        Pending
      </span>
    );
  };

  const getTotalStock = (item) => {
    // Calculate total stock from variants
    const variants = item.rawProduct?.variants || [];
    if (variants.length === 0) return 0;
    
    const totalStock = variants.reduce((sum, variant) => {
      // Use inventory_quantity, inventoryQuantity, or inventory_quantity_total
      const stock = variant.inventory_quantity || 
                   variant.inventoryQuantity || 
                   variant.inventory_quantity_total || 
                   0;
      return sum + stock;
    }, 0);
    
    return totalStock;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 text-zinc-900 transition-colors dark:from-black dark:via-zinc-950 dark:to-black dark:text-zinc-100">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 sm:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin/overview"
              className="mb-2 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to overview
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Shopify Items</h1>
            <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
              Process imported Shopify products and create store products
            </p>
          </div>
        </header>

        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search by title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <select
            value={selectedMarket}
            onChange={(e) => setSelectedMarket(e.target.value)}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="all">All markets</option>
            {availableMarkets.map((market) => (
              <option key={market} value={market}>
                {market}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-zinc-500">Loading Shopify items...</div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-12 text-center shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/60">
            <p className="text-zinc-600 dark:text-zinc-400">
              {searchTerm ? 'No items match your search.' : 'No Shopify items found.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="group rounded-2xl border border-zinc-200/70 bg-white/80 p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:hover:border-emerald-500/40"
              >
                <div className="mb-3 aspect-square w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                  {(item.imageUrls && item.imageUrls.length > 0) || (item.images && item.images.length > 0) ? (
                    <img
                      src={item.imageUrls?.[0] || item.images?.[0]}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-400">
                      <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                <h3 className="mb-2 line-clamp-2 text-sm font-medium">{item.title}</h3>
                <div className="flex items-center justify-between">
                  {getStatusBadge(item)}
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {getTotalStock(item)} in stock
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {selectedItem && (
          <ShopifyItemModal
            key={selectedItem.id || 'shopify-modal'}
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onSaved={() => {
              setSelectedItem(null);
              loadShopifyItems();
            }}
          />
        )}
      </main>
    </div>
  );
}

