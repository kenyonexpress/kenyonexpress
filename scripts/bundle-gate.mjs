#!/usr/bin/env node
/**
 * Fail the build when first-load JS for the product or checkout route exceeds
 * 180KB gzipped.
 *
 * Reads .next/app-build-manifest.json (App Router) and gzips each unique file
 * listed for those routes. Shared chunks that appear on both still count once
 * per route, which is how Next reports First Load JS.
 *
 * Exit: 0 under the ceiling, 1 over, 2 no build output.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

export const MAX_FIRST_LOAD_GZ = 180 * 1024
export const GATED_ROUTE_PATTERNS = [/\/product\//, /\/checkout/]

export function gzipSize(buffer) {
  return gzipSync(buffer).length
}

function walkJs(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walkJs(full, acc)
    else if (name.endsWith('.js')) acc.push(full)
  }
  return acc
}

function loadManifest(nextDir) {
  const appManifestPath = join(nextDir, 'app-build-manifest.json')
  if (!existsSync(appManifestPath)) return null
  return JSON.parse(readFileSync(appManifestPath, 'utf8'))
}

function filesForRoute(nextDir, listed) {
  const out = []
  for (const rel of listed) {
    const full = join(nextDir, rel)
    if (existsSync(full)) out.push(full)
  }
  return out
}

export function measureFirstLoad(nextDir = '.next') {
  const root = resolve(process.cwd(), nextDir)
  if (!existsSync(root)) {
    return { ok: false, reason: 'missing-build', routes: [], over: [] }
  }
  const manifest = loadManifest(root)
  const routes = []

  if (manifest?.pages) {
    for (const [route, listed] of Object.entries(manifest.pages)) {
      if (!GATED_ROUTE_PATTERNS.some((re) => re.test(route))) continue
      const files = filesForRoute(root, listed)
      const unique = [...new Set(files)]
      let gz = 0
      for (const file of unique) gz += gzipSize(readFileSync(file))
      routes.push({ route, files: unique.length, gz })
    }
  }

  if (routes.length === 0) {
    // Manifest missing the gated routes (build graph changed). Fall back to the
    // whole client JS graph so the gate cannot go silent.
    const chunks = walkJs(join(root, 'static'))
    let gz = 0
    for (const file of chunks) gz += gzipSize(readFileSync(file))
    routes.push({ route: '(all static JS)', files: chunks.length, gz })
  }

  const over = routes.filter((r) => r.gz > MAX_FIRST_LOAD_GZ)
  return { ok: over.length === 0, reason: over.length ? 'over-budget' : 'ok', routes, over }
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)}KB`
}

function main() {
  const result = measureFirstLoad()
  if (result.reason === 'missing-build') {
    console.error('bundle-gate: .next is missing. Run pnpm build first.')
    process.exit(2)
  }
  console.log(`bundle-gate: ceiling ${formatKb(MAX_FIRST_LOAD_GZ)} gz`)
  for (const route of result.routes) {
    const flag = route.gz > MAX_FIRST_LOAD_GZ ? 'FAIL' : 'ok'
    console.log(`  ${flag} ${route.route} ${formatKb(route.gz)} gz (${route.files} files)`)
  }
  if (!result.ok) {
    console.error(
      `bundle-gate: first-load JS exceeds ${formatKb(MAX_FIRST_LOAD_GZ)} gz on ${result.over.map((r) => r.route).join(', ')}`,
    )
    process.exit(1)
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)

if (isMain) main()
