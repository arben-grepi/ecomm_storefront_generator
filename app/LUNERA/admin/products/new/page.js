'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProductModal from '@/components/admin/ProductModal';

export default function NewProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryIdFromUrl = searchParams?.get('categoryId');
  const [showModal, setShowModal] = useState(true);

  const handleClose = () => {
    setShowModal(false);
    router.push(categoryIdFromUrl ? '/LUNERA/admin/categories' : '/LUNERA/admin/products');
  };

  const handleSaved = () => {
    setShowModal(false);
    router.push(categoryIdFromUrl ? '/LUNERA/admin/categories' : '/LUNERA/admin/products');
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
