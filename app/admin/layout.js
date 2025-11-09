'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeToAuth, isAdmin, signOutUser } from '@/lib/auth';

export default function AdminLayout({ children }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((user) => {
      if (!user || !isAdmin(user.email)) {
        router.push('/');
      } else {
        setLoading(false);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [router]);

  const handleSignOut = async () => {
    await signOutUser();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <nav className="border-b border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-semibold text-gray-800">Admin Dashboard</h1>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}

