'use client';

export default function AnalyticsPlanPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Implementation plan</p>
        <h1 className="text-3xl font-semibold text-zinc-900">Engagement & analytics</h1>
        <p className="text-base text-zinc-500">
          Plan for capturing customer behavior, aggregating insights, and powering personalization workflows.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-800">Milestones</h2>
        <ol className="list-decimal space-y-2 pl-6 text-zinc-600">
          <li>Implement client-side event logging (category/product views, add-to-cart) for authenticated users.</li>
          <li>Maintain aggregated counters on product and category documents for quick dashboard insights.</li>
          <li>Build admin dashboard widgets for top viewed products/categories.</li>
          <li>Create monthly digest pipeline to suggest targeted promotions.</li>
          <li>Introduce opt-in controls and privacy preferences visibility.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-zinc-800">Data flow</h2>
        <ul className="list-disc space-y-2 pl-6 text-zinc-600">
          <li>Write raw events to <code>userEvents</code> collection.</li>
          <li>Update product/category metrics transactionally alongside event writes.</li>
          <li>Schedule Cloud Function (cron) to build monthly personalization recommendations.</li>
          <li>Surface personalized recommendations inside marketing emails (future phase).</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-zinc-800">UX notes</h2>
        <ul className="list-disc space-y-2 pl-6 text-zinc-600">
          <li>Ensure consent is captured before logging behavior (marketingOptIn).</li>
          <li>Display data usage policy in account preferences.</li>
          <li>Offer export/delete data pathway for compliance.</li>
        </ul>
      </section>
    </div>
  );
}
