import Link from "next/link";
import { HeroCopyButton } from "./hero-copy-button";
import { IconSpark } from "./icons";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-zinc-200/80 bg-gradient-to-b from-zinc-50 via-white to-white dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(234,88,12,0.12),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(251,146,60,0.08),transparent)]"
      />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-4 py-14 sm:py-16 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-6 lg:py-20">
        <div className="max-w-2xl space-y-6 text-center lg:text-start">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--accent-deep)] dark:text-orange-200">
            <IconSpark className="h-3.5 w-3.5 text-[var(--accent)]" />
            עדכון יומי · קופונים מאומתים
          </div>
          <h1 className="text-balance text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl dark:text-white">
            המקום למצוא את{" "}
            <span className="bg-gradient-to-l from-[var(--accent)] to-amber-500 bg-clip-text text-transparent">
              המבצע הכי משתלם
            </span>{" "}
            בשבילכם
          </h1>
          <p className="text-pretty text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            אלפי קופונים מחנויות מובילות בישראל — מזון, אופנה, טכנולוגיה ועוד.
            חוסכים זמן, חוסכים כסף, בלי רעש.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link
              href="#deals"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-l from-[var(--accent)] to-[var(--accent-deep)] px-8 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-105 active:scale-[0.99]"
            >
              גלו מבצעים חמים
            </Link>
            <Link
              href="#categories"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-zinc-200 bg-white px-8 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              לפי קטגוריה
            </Link>
          </div>
          <dl className="grid grid-cols-3 gap-4 border-t border-zinc-200/80 pt-8 text-center sm:gap-8 lg:text-start dark:border-zinc-800">
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">קופונים פעילים</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">2,400+</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">חנויות</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">380+</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">משתמשים החודש</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">120k</dd>
            </div>
          </dl>
        </div>
        <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:max-w-sm">
          <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-orange-400/20 via-transparent to-amber-400/10 blur-2xl" aria-hidden />
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl shadow-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-center text-xs font-bold uppercase tracking-wider text-zinc-400">
              מבצע היום
            </p>
            <div className="mt-4 flex items-center justify-center">
              <span className="inline-flex rounded-2xl bg-gradient-to-l from-[var(--accent)] to-amber-500 px-5 py-2 text-3xl font-black text-white">
                עד 40%
              </span>
            </div>
            <p className="mt-4 text-center text-lg font-bold text-zinc-900 dark:text-white">משלוחים ומסעדות</p>
            <p className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400">Wolt · מסעדות נבחרות</p>
            <div className="mt-6 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/80">
              <p className="text-center font-mono text-lg font-bold tracking-widest text-zinc-800 dark:text-zinc-100">
                WOLT-IL-0526
              </p>
              <p className="mt-2 text-center text-xs text-zinc-500">הקוד בתוקף עד 10.5.2026</p>
            </div>
            <HeroCopyButton code="WOLT-IL-0526" />
          </div>
        </div>
      </div>
    </section>
  );
}
