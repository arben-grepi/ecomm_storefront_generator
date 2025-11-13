'use client';

import ProductModal from './ProductModal';

/**
 * ShopifyItemModal - Wrapper component for processing Shopify items
 * This is now a thin wrapper around ProductModal for backward compatibility
 */
export default function ShopifyItemModal({ item, onClose, onSaved }) {
  return <ProductModal mode="shopify" shopifyItem={item} onClose={onClose} onSaved={onSaved} />;
}
