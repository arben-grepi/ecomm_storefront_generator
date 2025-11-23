'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { getDocumentPath } from '@/lib/store-collections';
import ProductModal from '@/components/admin/ProductModal';
import { useWebsite } from '@/lib/website-context';

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params?.id;
  const db = getFirebaseDb();
  const { selectedWebsite } = useWebsite();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProduct = async () => {
      if (!db || !productId) {
        setLoading(false);
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, ...getDocumentPath('products', productId)));
        if (snapshot.exists()) {
          setProduct({ id: snapshot.id, ...snapshot.data() });
        }
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [db, productId]);

  const basePath = '/admin';

  if (loading) {
    return null;
  }

  if (!product) {
    router.push(`${basePath}/products`);
    return null;
  }

  return (
    <ProductModal
      mode="edit"
      existingProduct={product}
      onClose={() => router.push(`${basePath}/products`)}
      onSaved={() => router.push(`${basePath}/products`)}
    />
  );
}

