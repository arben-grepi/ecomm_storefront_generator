'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProductModal from '@/components/admin/ProductModal';
import { useWebsite } from '@/lib/website-context';

function NewProductPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryIdFromUrl = searchParams?.get('categoryId');
  const [showModal, setShowModal] = useState(true);
  const { selectedWebsite } = useWebsite();

  const basePath = '/admin';

  const handleClose = () => {
    setShowModal(false);
    router.push(categoryIdFromUrl ? `${basePath}/categories` : `${basePath}/products`);
  };

  const handleSaved = () => {
    setShowModal(false);
    router.push(categoryIdFromUrl ? `${basePath}/categories` : `${basePath}/products`);
  };

  if (!showModal) {
    return null;
  }

  return (
    <ProductModal
      mode="manual"
      onClose={handleClose}
      onSaved={handleSaved}
      initialCategoryId={categoryIdFromUrl || undefined}
    />
  );
}

// Wrap NewProductPageContent in Suspense to handle useSearchParams
export default function NewProductPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    }>
      <NewProductPageContent />
    </Suspense>
  );
}
