'use client';

import { useWebsite } from '@/lib/website-context';
import { useRouter, usePathname } from 'next/navigation';

export default function WebsiteSelector() {
  const { selectedWebsite, availableWebsites, setSelectedWebsite, loading } = useWebsite();
  const router = useRouter();
  const pathname = usePathname();

  const handleWebsiteChange = (e) => {
    const newWebsite = e.target.value;
    setSelectedWebsite(newWebsite);

    // For admin routes, stay on the same admin page, just change the selected website
    // The data will update automatically via the context
    const pathSegments = pathname.split('/').filter(Boolean);
    
    if (pathSegments.length > 0 && pathSegments[0] === 'admin') {
      // We're in admin, stay on the same admin route
      // The selectedWebsite change will trigger data refetch via context
      return;
    } else if (pathSegments.length > 0) {
      // Storefront route, update the website segment
      pathSegments[0] = newWebsite;
      router.push(`/${pathSegments.join('/')}`);
    } else {
      // Root path, go to admin overview
      router.push('/admin/overview');
    }
  };

  if (loading || availableWebsites.length <= 1) {
    // Don't show selector if only one website or still loading
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="website-selector" className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
        Website:
      </label>
      <select
        id="website-selector"
        value={selectedWebsite}
        onChange={handleWebsiteChange}
        className="rounded-full border border-zinc-200/70 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:border-emerald-200 hover:bg-emerald-50/50 focus:border-emerald-400 focus:outline-none dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:focus:border-emerald-500"
      >
        {availableWebsites.map((website) => (
          <option key={website} value={website}>
            {website}
          </option>
        ))}
      </select>
    </div>
  );
}

