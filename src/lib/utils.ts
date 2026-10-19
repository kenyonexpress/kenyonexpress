import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(amount: number, currency = 'ILS'): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/*
 * A `slugify` used to live here and was removed on 2026-09-08. It read
 *
 *     .replace(/[^\w\s-]/g, '')
 *
 * and `\w` without the `u` flag is ASCII only, so it deleted every Hebrew
 * character. Measured: `slugify('עיסוי מפנק לגבר')` returned the EMPTY STRING,
 * and `'עיסוי 45 דקות רק ב108₪'` returned `'45-108'` - the digits survived and
 * the words did not. On a storefront whose every product name is Hebrew, that
 * is a function that cannot do its job for any real input.
 *
 * It had zero callers: both real ones, `ProductForm` and `CategoryDialog`,
 * import from `@/lib/utils/slugify`, which transliterates. So this was dead
 * code - and dead code shaped like a loaded gun, because sixteen files import
 * from `@/lib/utils` for `cn` and `formatPrice`, which makes it the path an
 * autocomplete offers first. The failure would have been silent: an empty slug,
 * not an error.
 *
 * There is one slugify in `src/` now, and `src/lib/utils/slugify.test.ts`
 * fails if a second appears. `scripts/wp-import/lib/wxr.mjs` keeps its own on
 * purpose: it has the opposite contract - `/[^\p{L}\p{N}-]/gu` PRESERVES the
 * Hebrew, because it is reproducing slugs WordPress already published rather
 * than minting new ones.
 */
