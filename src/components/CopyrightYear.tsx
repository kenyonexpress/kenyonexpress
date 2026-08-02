import { cacheLife } from 'next/cache'

/**
 * The current year, as a cached value rather than a read of the clock.
 *
 * `new Date()` in a server component is uncached runtime data under
 * `cacheComponents`, and Next refuses to prerender a component that reads the
 * clock before it has read anything else uncached - otherwise a page baked at
 * build time would carry the build's year forever, silently, and only somebody
 * looking at the footer next January would find out.
 *
 * `use cache` with the `days` profile is the fix the error message points at:
 * the year is recomputed on the server at most once a day, which is 365 times
 * more often than it changes, and the footer stays in the static shell.
 */
export default async function CopyrightYear() {
  'use cache'
  cacheLife('days')
  return <>{new Date().getFullYear()}</>
}
