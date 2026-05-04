import Image from "next/image";
import type { Deal } from "@/lib/types";
import { formatDealEndDate } from "@/lib/data";

type Props = {
  deal: Deal;
  priority?: boolean;
};

export function DealCard({ deal, priority }: Props) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)]/35 hover:shadow-lg hover:shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-[var(--accent)]/40">
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        <Image
          src={deal.imageUrl}
          alt={deal.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
          priority={priority}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-80" />
        <span className="absolute start-3 top-3 inline-flex items-center rounded-lg bg-white/95 px-2.5 py-1 text-xs font-black text-[var(--accent-deep)] shadow-sm backdrop-blur dark:bg-zinc-950/95 dark:text-orange-300">
          {deal.discountLabel}
        </span>
        <span className="absolute bottom-3 start-3 end-3 truncate text-sm font-bold text-white drop-shadow">
          {deal.merchant}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-zinc-900 dark:text-white">
          {deal.title}
        </h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {deal.description}
        </p>
        <p className="mt-auto text-xs font-medium text-zinc-500 dark:text-zinc-500">
          בתוקף עד {formatDealEndDate(deal.endsAt)}
        </p>
        <button
          type="button"
          className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-white transition group-hover:bg-[var(--accent)] group-hover:text-white dark:bg-zinc-100 dark:text-zinc-900 dark:group-hover:bg-[var(--accent)] dark:group-hover:text-white"
        >
          קבלו קופון
        </button>
      </div>
    </article>
  );
}
