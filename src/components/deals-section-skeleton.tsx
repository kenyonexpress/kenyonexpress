export function DealsSectionSkeleton() {
  return (
    <section className="scroll-mt-28 bg-zinc-50 py-12 dark:bg-zinc-900/50 sm:py-16" aria-hidden>
      <div className="mx-auto max-w-7xl px-4 lg:px-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-4 h-4 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="aspect-[16/10] animate-pulse bg-zinc-200 dark:bg-zinc-800" />
              <div className="space-y-3 p-4">
                <div className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 w-[85%] animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-10 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
