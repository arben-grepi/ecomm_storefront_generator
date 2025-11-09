'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import SupplierModalButton from '@/components/admin/SupplierModalButton';

export default function SupplierSelector({ value, onChange, label = 'Supplier' }) {
  const db = getFirebaseDb();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    const suppliersQuery = query(collection(db, 'suppliers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      suppliersQuery,
      (snapshot) => {
        const next = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setSuppliers(next);
        setLoading(false);
      },
      (error) => {
        // Silently handle permission errors - suppliers are optional
        if (error.code !== 'permission-denied') {
          console.error('Failed to fetch suppliers', error);
        }
        setSuppliers([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db]);

  const handleCreated = (supplier) => {
    setSuppliers((prev) => {
      const exists = prev.some((item) => item.id === supplier.id);
      if (exists) {
        return prev;
      }
      return [...prev, supplier];
    });
    if (onChange) {
      onChange(supplier.id);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-600">{label}</span>
      <div className="flex items-center gap-3">
        <select
          value={value || ''}
          onChange={(event) => onChange && onChange(event.target.value || null)}
          className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-emerald-400 focus:outline-none"
          disabled={loading || !db}
        >
          <option value="">None</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        {db ? (
          <div className="relative group">
            <SupplierModalButton onCompleted={handleCreated} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

