#!/usr/bin/env node
/**
 * S33 (06.11.2026): the two things a loading.tsx can cost, measured on a real
 * build, plus the error documents themselves.
 *
 * Usage:
 *   pnpm build && pnpm start -p 3333      (in another shell)
 *   node scripts/error-states-check.mjs --base=http://localhost:3333
 *
 * WHY A SCRIPT AND NOT ONLY A UNIT TEST. Both failures below are properties of
 * the BUILD, and neither is visible in source:
 *
 *   1. STATUS. A loading.tsx is a Suspense boundary above every page under
 *      it. The shell goes out with the status line, so a notFound() below it
 *      runs too late. On this item's first build, with one at the root of
 *      (store) and of (main), every unknown product, category, supplier-store,
 *      city and coupon URL answered 200.
 *   2. FIRST PAINT. A page that used to prerender whole now prerenders as the
 *      loading fallback plus a script that swaps the content in. On the second
 *      build, with one at the root of (auth) and on /search, the built HTML of
 *      five pages painted the loading state where the page had been.
 *
 * So this reads the prerendered shells in .next/server/app and fails if the
 * loading state is painted anywhere outside the places it belongs, and then
 * asks the running build for the status of every URL in the table.
 *
 * Exit: 0 all checks pass, 1 a check failed, 2 the build or the server is
 * missing.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const argOf = (name, dflt) => {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`))
  return eq ? eq.slice(name.length + 3) : dflt
}
const BASE = argOf('base', process.env.LOCAL_BASE ?? 'http://localhost:3333')
const SHELLS = resolve(process.cwd(), '.next/server/app')

/**
 * Where the loading state may be the painted shell. These pages read rows
 * scoped to the signed-in visitor at request time, so before S33 their shell
 * was an empty box in the same place.
 */
const MAY_PAINT_LOADING = [/^\/account(\/|\.html$)/, /^\/supplier\/apply\.html$/]

/**
 * URL -> status. The 404 rows are the point: each one is a page that calls
 * notFound(), and each answered 200 on a build that had a loading.tsx above it.
 * The others pin what must not move: prerendered pages, the proxy's sign-in
 * redirects, the legal 308s, the retired wishlist.
 */
const STATUS = [
  ['/', 200],
  ['/products', 200],
  ['/product/barbecue', 200],
  ['/cart', 200],
  ['/login', 200],
  ['/forgot-password', 200],
  ['/search?q=a', 200],
  ['/coupons', 200],
  ['/faq', 200],
  ['/offline', 200],
  ['/offline.html', 200],
  ['/zzz-nope', 404],
  ['/product/zzz-nope', 404],
  ['/category/zzz-nope', 404],
  ['/s/zzz-nope', 404],
  ['/city/zzz-nope', 404],
  ['/blog/zzz-nope', 404],
  ['/page/zzz-nope', 404],
  ['/order/zzz', 404],
  ['/coupons/00000000-0000-4000-8000-000000000000', 404],
  // Not a uuid at all. Answered 500 before S33: the read threw 22P02.
  ['/coupons/zzz-nope', 404],
  ['/checkout', 307],
  ['/account/orders', 307],
  ['/account/coupons', 307],
  ['/account/vouchers', 307],
  ['/admin', 307],
  ['/supplier', 307],
  ['/supplier/apply', 307],
  ['/legal/terms', 308],
  ['/legal/privacy', 308],
  ['/wishlist', 410],
]

let failed = 0
const pass = (label) => console.log(`  ok    ${label}`)
const fail = (label, detail) => {
  failed += 1
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`)
}

function walkHtml(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...walkHtml(full))
    else if (entry.endsWith('.html')) found.push(full)
  }
  return found
}

/** The markup a browser paints: everything outside <script>. */
const painted = (html) => html.replace(/<script\b[\s\S]*?<\/script>/g, '')

// ---------------------------------------------------------------- 1. shells
console.log('1. prerendered shells: where the loading state is painted')
if (!existsSync(SHELLS)) {
  console.error(`no build at ${SHELLS}. Run pnpm build first.`)
  process.exit(2)
}
const shells = walkHtml(SHELLS)
const paintedIn = shells
  .filter((file) => painted(readFileSync(file, 'utf8')).includes('data-testid="route-loading"'))
  .map((file) => file.slice(SHELLS.length))
  .sort()
const misplaced = paintedIn.filter((route) => !MAY_PAINT_LOADING.some((re) => re.test(route)))
console.log(`  ${shells.length} shells read, loading state painted in ${paintedIn.length}`)
if (misplaced.length === 0) pass('painted only under /account and on /supplier/apply')
else fail('loading state painted where a page used to be', misplaced.join(', '))

const accountShells = paintedIn.filter((route) => route.startsWith('/account'))
if (accountShells.length >= 10) pass(`account shells carry it (${accountShells.length})`)
else fail('account shells do not carry the loading state', `${accountShells.length} found`)

const heldBox = accountShells.every((route) =>
  painted(readFileSync(join(SHELLS, route), 'utf8')).includes('account-content__pending'),
)
if (heldBox) pass('every account shell still holds .account-content__pending (V08)')
else fail('an account shell lost .account-content__pending')

for (const route of ['/cart.html', '/forgot-password.html', '/reset-password.html', '/mfa.html']) {
  const file = join(SHELLS, route)
  if (!existsSync(file)) {
    fail(`${route} was not prerendered`)
    continue
  }
  const body = painted(readFileSync(file, 'utf8'))
  if (body.includes('data-testid="route-loading"')) fail(`${route} paints the loading state`)
  else pass(`${route} is prerendered whole`)
}

// ---------------------------------------------------------------- 2. status
console.log(`2. status codes on ${BASE}`)
try {
  await fetch(`${BASE}/api/health`, { redirect: 'manual' })
} catch {
  console.error(`nothing answers on ${BASE}. Start the build first.`)
  process.exit(2)
}
for (const [path, expected] of STATUS) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' })
  await res.arrayBuffer()
  if (res.status === expected) pass(`${expected}  ${path}`)
  else fail(`${path}`, `expected ${expected}, got ${res.status}`)
}

// ------------------------------------------------------------- 3. documents
console.log('3. the error documents')
const notFound = await (await fetch(`${BASE}/zzz-nope`)).text()
for (const marker of [
  'ke-error-page__code',
  'ke-error-page__support',
  '/images/logo.webp',
  'mailto:',
  'wa.me/',
  'dir="rtl"',
]) {
  if (notFound.includes(marker)) pass(`404 carries ${marker}`)
  else fail(`404 is missing ${marker}`)
}
const productMiss = await (await fetch(`${BASE}/product/zzz-nope`)).text()
if (productMiss.includes('ke-error-page__code')) pass('an unknown product renders the branded 404')
else fail('an unknown product does not render the branded 404')

console.log(failed === 0 ? '\nerror-states check: PASS' : `\nerror-states check: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
