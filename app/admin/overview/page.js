import Link from 'next/link';
import EditSiteInfoButton from '@/components/admin/EditSiteInfoButton';

export default function EcommerceOverview() {
  const stats = [
    { label: 'Total Revenue', value: '$82,450', trend: '+12.4% vs. last month' },
    { label: 'Orders', value: '1,248', trend: '+4.1%' },
    { label: 'Active Customers', value: '5,327', trend: '↗︎ steady' },
    { label: 'Refund Rate', value: '1.8%', trend: '-0.6%' },
  ];

  const recentOrders = [
    {
      id: 'INV-2043',
      customer: 'Maria Chen',
      total: '$248.90',
      status: 'Fulfilled',
      date: '2 hours ago',
    },
    {
      id: 'INV-2042',
      customer: 'Jordan Lee',
      total: '$89.10',
      status: 'Processing',
      date: '4 hours ago',
    },
    {
      id: 'INV-2041',
      customer: 'Gabriel Alvarez',
      total: '$642.37',
      status: 'Pending',
      date: 'Yesterday',
    },
  ];

  const quickLinks = [
    { href: '/admin/products/new', label: 'Create new product' },
    { href: '/admin/products', label: 'View all products' },
    { href: '/admin/categories', label: 'Manage categories' },
    { href: '/admin/promotions', label: 'Manage promotions' },
    { href: '/admin/analytics', label: 'View analytics' },
    { href: '/admin/plans/orders', label: 'Order operations plan' },
    { href: '/admin/overview/shopifyItems', label: 'Process Shopify Items' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 text-zinc-900 transition-colors dark:from-black dark:via-zinc-950 dark:to-black dark:text-zinc-100">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-14 sm:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Dashboard
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Ecommerce overview
            </h1>
            <p className="max-w-xl text-base text-zinc-600 dark:text-zinc-400">
              Stay up to date with store performance, monitor recent activity,
              and jump back into the workflows you revisit most.
            </p>
          </div>
          <button className="h-11 rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200">
            Create report
          </button>
        </header>

        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-3xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900/60"
            >
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {stat.label}
              </p>
              <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
              <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
                {stat.trend}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/60">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent orders</h2>
              <a className="text-sm font-medium text-emerald-600 dark:text-emerald-400" href="#">
                View all
              </a>
            </div>
            <ul className="mt-6 space-y-4">
              {recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-col gap-1 rounded-2xl border border-zinc-200/60 px-4 py-3 transition hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-zinc-800/70 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
                >
                  <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                    <span>{order.id}</span>
                    <span>{order.date}</span>
                  </div>
                  <div className="flex items-center justify-between text-base font-medium">
                    <span>{order.customer}</span>
                    <span>{order.total}</span>
                  </div>
                  <span className="text-sm text-emerald-600 dark:text-emerald-400">
                    {order.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <aside className="flex flex-col gap-6 rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/60">
            <div>
              <h2 className="text-lg font-semibold">Quick links</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Jump into the implementation guides for key workflows.
              </p>
            </div>
            <nav className="flex flex-col gap-3">
              {quickLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="rounded-full border border-zinc-200/70 px-4 py-2 text-sm font-medium transition hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-zinc-800/80 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10"
                >
                  {link.label}
                </Link>
              ))}
              <EditSiteInfoButton className="w-full" />
            </nav>

            <div className="rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
              <p className="font-medium">Need more insight?</p>
              <p className="mt-1">
                Enable advanced analytics to unlock cohort reports, forecast
                tools, and more in-depth sales data.
              </p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

