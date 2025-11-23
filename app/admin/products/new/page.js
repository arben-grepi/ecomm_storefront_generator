'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProductModal from '@/components/admin/ProductModal';
import { useWebsite } from '@/lib/website-context';

export default function NewProductPage() {
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
