/**
 * TTFB and first-paint for the routes cacheComponents was meant to move.
 *
 * Interleaved A/B, not two batches: the build is swapped and the server
 * restarted between EVERY pair, because two runs of the same build back to back
 * drift with whatever else the machine is doing. Same finding as the CSS work
 * in [21], which is why it is done this way here too.
 *
 *   node scripts/_shell-ttfb.mjs <beforeDir> <afterDir> [rounds]
 *
 * `beforeDir` and `afterDir` are saved copies of `.next`. The script moves one
 * into place, starts `next start`, measures, stops it, and repeats.
 */
import { spawn } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'
import { chromium } from '@playwright/test'

const [beforeDir, afterDir, roundsRaw] = process.argv.slice(2)
const ROUNDS = Number(roundsRaw ?? 4)
const PORT = 3319
const BASE = `http://localhost:${PORT}`
const ROUTES = ['/', '/products', '/cart']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function startServer() {
  const proc = spawn('node_modules/.bin/next', ['start', '--port', String(PORT)], {
    stdio: 'ignore',
    detached: true,
  })
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    try {
      const res = await fetch(BASE, { redirect: 'manual' })
      if (res.status < 500) return proc
    } catch {}
  }
  throw new Error('server did not come up')
}

function stopServer(proc) {
  try {
    process.kill(-proc.pid, 'SIGKILL')
  } catch {}
}

/**
 * TTFB is taken from the browser's own navigation timing rather than from curl,
 * because the number that matters is the one a shopper's browser records, and
 * because FCP has to come from the same navigation to be comparable.
 */
async function measure(browser, url) {
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'load' })
  const out = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    return {
      ttfb: nav ? nav.responseStart - nav.requestStart : null,
      fcp: fcp ? fcp.startTime : null,
    }
  })
  await page.close()
  return out
}

const results = { before: {}, after: {} }
for (const r of ROUTES) {
  results.before[r] = { ttfb: [], fcp: [] }
  results.after[r] = { ttfb: [], fcp: [] }
}

const browser = await chromium.launch()
for (let round = 0; round < ROUNDS; round++) {
  for (const [label, dir] of [
    ['before', beforeDir],
    ['after', afterDir],
  ]) {
    rmSync('.next', { recursive: true, force: true })
    cpSync(dir, '.next', { recursive: true })
    const proc = await startServer()
    // One untimed request per route first: the very first hit to a route pays
    // for module loading, and charging that to whichever build happened to go
    // first is how an A/B invents a difference.
    for (const route of ROUTES) await fetch(BASE + route).then((r) => r.text())
    for (const route of ROUTES) {
      const m = await measure(browser, BASE + route)
      results[label][route].ttfb.push(m.ttfb)
      results[label][route].fcp.push(m.fcp)
    }
    stopServer(proc)
    await sleep(700)
  }
  console.error(`round ${round + 1}/${ROUNDS} done`)
}
await browser.close()

const med = (a) => {
  const s = [...a].filter((n) => n != null).sort((x, y) => x - y)
  return s.length ? s[Math.floor(s.length / 2)] : Number.NaN
}
const fmt = (n) => `${n.toFixed(0)}ms`

console.log(
  `\n${'route'.padEnd(12)}${'TTFB before'.padEnd(14)}${'TTFB after'.padEnd(14)}${'FCP before'.padEnd(14)}FCP after`,
)
for (const r of ROUTES) {
  console.log(
    r.padEnd(12) +
      fmt(med(results.before[r].ttfb)).padEnd(14) +
      fmt(med(results.after[r].ttfb)).padEnd(14) +
      fmt(med(results.before[r].fcp)).padEnd(14) +
      fmt(med(results.after[r].fcp)),
  )
}
console.log('\nraw (each round):')
for (const r of ROUTES) {
  console.log(`  ${r}`)
  console.log(`    ttfb before ${results.before[r].ttfb.map((n) => n?.toFixed(0)).join(' ')}`)
  console.log(`    ttfb after  ${results.after[r].ttfb.map((n) => n?.toFixed(0)).join(' ')}`)
  console.log(`    fcp  before ${results.before[r].fcp.map((n) => n?.toFixed(0)).join(' ')}`)
  console.log(`    fcp  after  ${results.after[r].fcp.map((n) => n?.toFixed(0)).join(' ')}`)
}
