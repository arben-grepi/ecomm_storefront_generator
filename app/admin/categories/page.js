'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import CategoryModalButton from '@/components/admin/CreateCategoryButton';
import Toast from '@/components/admin/Toast';

export default function CategoriesAdminPage() {
  const router = useRouter();
  const db = getFirebaseDb();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }

    const categoriesQuery = query(collection(db, 'categories'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
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

    return () => unsubscribe();
  }, [db]);

  const handleToggleActive = async (category) => {
    if (!db) {
      return;
    }

    try {
      await updateDoc(doc(db, 'categories', category.id), {
        active: category.active === false ? true : false,
        updatedAt: serverTimestamp(),
      });
      setMessage({ type: 'success', text: `Category "${category.name}" updated.` });
    } catch (error) {
      console.error('Failed to update category', error);
      setMessage({ type: 'error', text: 'Failed to update category. Check console for details.' });
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <button
          onClick={() => router.push('/admin/overview')}
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

      <section className="overflow-hidden rounded-3xl border border-zinc-200/70">
        <table className="min-w-full divide-y divide-zinc-100 bg-white text-sm">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Slug</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                  Loading categories…
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                  No categories yet. Create the first one to get started.
                </td>
              </tr>
            ) : (
              categories.map((category) => (
                <tr key={category.id} className="hover:bg-zinc-50/80">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-800">{category.name}</span>
                      {category.description ? (
                        <span className="text-xs text-zinc-400">{category.description}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{category.slug || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        category.active === false
                          ? 'bg-rose-100 text-rose-600'
                          : 'bg-emerald-100 text-emerald-600'
                      }`}
                    >
                      {category.active === false ? 'Hidden' : 'Visible'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {category.createdAt?.toDate ? category.createdAt.toDate().toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <CategoryModalButton
                        mode="edit"
                        triggerLabel="Edit"
                        category={category}
                        onCompleted={(updatedCategory) => {
                          setMessage({ type: 'success', text: `Category "${updatedCategory.name || category.name}" saved.` });
                        }}
                        className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                      />
                      <button
                        type="button"
                        onClick={() => handleToggleActive(category)}
                        className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                      >
                        {category.active === false ? 'Unhide' : 'Hide'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
