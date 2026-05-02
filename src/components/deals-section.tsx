"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { deals, getFeaturedDeals } from "@/lib/data";
import { DealCard } from "./deal-card";

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export function DealsSection() {
  const searchParams = useSearchParams();
  const qRaw = searchParams.get("q");
  const cat = searchParams.get("cat");

  const q = qRaw ? normalize(qRaw) : "";

  const filtered = useMemo(() => {
    let list = deals;
    if (cat && cat !== "all") {
      list = list.filter((d) => d.categoryId === cat);
    }
    if (q) {
      list = list.filter((d) => {
        const hay = normalize(
          `${d.title} ${d.merchant} ${d.description} ${d.discountLabel}`,
        );
        return hay.includes(q);
      });
    }
    return list;
  }, [q, cat]);

  const featured = useMemo(() => getFeaturedDeals(), []);
  const showFeaturedBlock = !q && (!cat || cat === "all");

  const secondaryDeals = useMemo(() => {
    if (!showFeaturedBlock) return [];
    const ids = new Set(featured.map((d) => d.id));
    return deals.filter((d) => !ids.has(d.id));
  }, [showFeaturedBlock, featured]);

  return (
    <section
      id="deals"
      className="scroll-mt-28 bg-zinc-50 py-12 dark:bg-zinc-900/50 sm:py-16"
      aria-labelledby="deals-heading"
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="deals-heading" className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              {q ? "תוצאות חיפוש" : "מבצעים שווים עכשיו"}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {q || (cat && cat !== "all")
                ? `${filtered.length} מבצעים מתאימים · עודכן היום`
                : "נבחרו עבורכם לפי פופולריות ואמינות המבצע"}
            </p>
          </div>
          {(q || (cat && cat !== "all")) && (
            <Link
              href="/#deals"
              className="text-sm font-semibold text-[var(--accent-deep)] underline-offset-4 hover:underline dark:text-orange-300"
            >
              נקה מסננים
            </Link>
          )}
        </div>

        {showFeaturedBlock && (
          <div className="mt-10">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              מומלצים השבוע
            </h3>
            <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((deal, i) => (
                <li key={deal.id}>
                  <DealCard deal={deal} priority={i < 2} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={showFeaturedBlock ? "mt-14" : "mt-10"}>
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {showFeaturedBlock ? "עוד מבצעים בשבילכם" : "רשימה"}
          </h3>
          {(() => {
            const list = showFeaturedBlock ? secondaryDeals : filtered;
            if (list.length === 0) {
              return (
                <p className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                  לא מצאנו מבצעים לחיפוש הזה.{" "}
                  <Link
                    href="/#deals"
                    className="font-semibold text-[var(--accent-deep)] dark:text-orange-300"
                  >
                    חזרה לכל המבצעים
                  </Link>
                </p>
              );
            }
            return (
              <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {list.map((deal, i) => (
                  <li key={deal.id}>
                    <DealCard deal={deal} priority={!showFeaturedBlock && i < 2} />
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      </div>
    </section>
  );
}
