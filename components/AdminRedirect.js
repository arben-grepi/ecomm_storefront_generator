'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeToAuth, isAdmin } from '@/lib/auth';

export default function AdminRedirect() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = subscribeToAuth((user) => {
      if (user && isAdmin(user.email)) {
        router.push('/LUNERA/admin/overview');
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [router]);

  return null;
}

