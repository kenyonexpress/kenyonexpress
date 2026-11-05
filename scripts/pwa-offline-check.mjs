#!/usr/bin/env node
/**
 * Offline behaviour of public/sw.js, measured in a real browser (S32).
 *
 * `pwa-installability.mjs` reads what the server puts on the wire. It cannot
 * say what a visitor sees once the network is gone, because that is decided
 * inside the worker. This drives Chromium through the three cases the worker's
 * header promises, against a running production build:
 *
 *   1. After one online visit the worker controls the page and has precached
 *      the offline shell (`/offline`), its static twin (`/offline.html`) and
 *      the launcher icon.
 *   2. Offline, a browse page that was visited online is served again from the
 *      pages cache: same document, not the shell.
 *   3. Offline, a page that was never visited gets the offline shell, in
 *      Hebrew and right to left, and not the browser's own error page.
 *   4. Offline, a money path (`/cart`) is NOT answered by the worker at all.
 *      The bypass list is the feature: a cart served from a cache is a wrong
 *      total. The navigation must fail in the browser.
 *
 * Usage: LOCAL_BASE=http://localhost:3332 node scripts/pwa-offline-check.mjs
 * The server must be `next start`: the registrar only runs in production.
 * Exit 0 when every check passes, 1 otherwise.
 */

import { chromium } from '@playwright/test'

const BASE = (process.env.LOCAL_BASE ?? 'http://localhost:3000').replace(/\/$/, '')
const VISITED = '/products'
const NEVER_VISITED = '/terms-and-conditions'
const MONEY_PATH = '/cart'
const HEBREW = /[֐-׿]/

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 380, height: 800 },
  locale: 'he-IL',
})
const page = await context.newPage()

try {
  // 1. One online visit. The registrar waits for `load`, and the worker claims
  // the page on activate, so `ready` plus a controller is the whole handshake.
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  const controlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return navigator.serviceWorker.controller?.scriptURL ?? null
  })
  check('worker controls the page after one visit', Boolean(controlled), String(controlled))

  const precache = await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.endsWith('-static'))
    if (!name) return { name: null, paths: [] }
    const keys = await (await caches.open(name)).keys()
    return { name, paths: keys.map((request) => new URL(request.url).pathname) }
  })
  for (const path of ['/offline', '/offline.html', '/icons/icon-192.png']) {
    check(`precache holds ${path}`, precache.paths.includes(path), precache.name ?? 'no cache')
  }

  // A browse page, visited online under the worker, so it lands in the pages
  // cache. The put is fire-and-forget; poll the cache rather than sleep.
  const online = await page.goto(`${BASE}${VISITED}`, { waitUntil: 'load' })
  const onlineTitle = await page.title()
  check(`${VISITED} answers 200 online`, online?.status() === 200, `status ${online?.status()}`)
  const cached = await page.evaluate(async (path) => {
    for (let i = 0; i < 50; i += 1) {
      const name = (await caches.keys()).find((key) => key.endsWith('-pages'))
      if (name) {
        const keys = await (await caches.open(name)).keys()
        if (keys.some((request) => new URL(request.url).pathname === path)) return true
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return false
  }, VISITED)
  check(`${VISITED} is in the pages cache`, cached)

  await context.setOffline(true)

  // 2. The visited browse page, offline.
  const seen = await page.goto(`${BASE}${VISITED}`, { waitUntil: 'domcontentloaded' })
  const seenTitle = await page.title()
  check(
    `offline: ${VISITED} is served from the pages cache`,
    seen?.status() === 200 && seen.fromServiceWorker() && seenTitle === onlineTitle,
    `status ${seen?.status()}, fromServiceWorker ${seen?.fromServiceWorker()}, title "${seenTitle}"`,
  )

  // 3. A page nobody visited, offline.
  const shell = await page.goto(`${BASE}${NEVER_VISITED}`, { waitUntil: 'domcontentloaded' })
  const shellState = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent?.trim() ?? '',
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    retry: document.querySelector('a.ke-error-page__btn')?.getAttribute('href') ?? null,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  check(
    `offline: ${NEVER_VISITED} gets the offline shell`,
    shell?.status() === 200 && shell.fromServiceWorker() && HEBREW.test(shellState.title),
    `status ${shell?.status()}, fromServiceWorker ${shell?.fromServiceWorker()}, h1 "${shellState.title}"`,
  )
  check(
    'offline shell is lang=he dir=rtl',
    shellState.lang === 'he' && shellState.dir === 'rtl',
    `lang ${shellState.lang} dir ${shellState.dir}`,
  )
  check('offline shell offers a retry link', shellState.retry === '/', String(shellState.retry))
  check(
    'offline shell has no horizontal scroll at 380',
    shellState.overflow <= 0,
    `${shellState.overflow}px`,
  )

  // 4. A money path, offline. The worker must stay out of it.
  let moneyError = null
  let moneyResponse = null
  try {
    moneyResponse = await page.goto(`${BASE}${MONEY_PATH}`, { waitUntil: 'domcontentloaded' })
  } catch (error) {
    moneyError = error instanceof Error ? error.message.split('\n')[0] : String(error)
  }
  check(
    `offline: ${MONEY_PATH} is not answered from any cache`,
    moneyError !== null && moneyResponse === null,
    moneyError ?? `answered ${moneyResponse?.status()}`,
  )
} finally {
  await browser.close()
}

for (const { name, ok, detail } of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const failed = results.filter((result) => !result.ok)
console.log(
  `\npwa offline: ${results.length - failed.length}/${results.length} checks pass against ${BASE}`,
)
process.exit(failed.length === 0 ? 0 : 1)
