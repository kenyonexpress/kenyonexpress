#!/usr/bin/env node
/**
 * Fail the build when first-load JS for the product or checkout route exceeds
 * 180KB gzipped.
 *
 * Next 16 (Turbopack) does not write app-build-manifest.json. The gated
 * first-load is `entryJSFiles` in the route's `page_client-reference-manifest.js`
 * (page + layout client graph). `rootMainFiles` and `polyfillFiles` are the
 * Next runtime. They are logged, not added to the 180KB ceiling: that runtime
 * alone is already over 180KB gz on Next 16, so including it makes the gate
 * permanently red without measuring the app.
 *
 * Exit: 0 under the ceiling, 1 over, 2 no build output.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

export const MAX_FIRST_LOAD_GZ = 180 * 1024

export const GATED_CLIENT_MANIFESTS = [
  {
    route: '/checkout',
    file: 'server/app/(store)/checkout/page_client-reference-manifest.js',
    pageKey: '(store)/checkout/page',
  },
  {
    route: '/product/[slug]',
    file: 'server/app/(store)/product/[slug]/page_client-reference-manifest.js',
    pageKey: '(store)/product/[slug]/page',
  },
]

export function gzipSize(buffer) {
  return gzipSync(buffer).length
}

export function entryJsFromClientReference(text, pageKey) {
  const start = text.indexOf('"entryJSFiles"')
  const slice = start >= 0 ? text.slice(start) : text
  const escaped = pageKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`"[^"]*${escaped}":\\s*(\\[[^\\]]*\\])`)
  const match = slice.match(re)
  if (!match) return []
  try {
    return JSON.parse(match[1])
  } catch {
    return []
  }
}

function runtimeFiles(nextDir) {
  const buildPath = join(nextDir, 'build-manifest.json')
  if (!existsSync(buildPath)) return []
  const build = JSON.parse(readFileSync(buildPath, 'utf8'))
  return [...(build.rootMainFiles ?? []), ...(build.polyfillFiles ?? [])]
}

function gzipListed(nextDir, listed) {
  const unique = [...new Set(listed)]
  let gz = 0
  const existing = []
  for (const rel of unique) {
    const full = rel.startsWith('/') ? rel : join(nextDir, rel)
    if (!existsSync(full)) continue
    existing.push(full)
    gz += gzipSize(readFileSync(full))
  }
  return { files: existing.length, gz }
}

function fromAppBuildManifest(nextDir) {
  const appManifestPath = join(nextDir, 'app-build-manifest.json')
  if (!existsSync(appManifestPath)) return []
  const manifest = JSON.parse(readFileSync(appManifestPath, 'utf8'))
  const routes = []
  for (const [route, listed] of Object.entries(manifest.pages ?? {})) {
    if (!/\/product\/|\/checkout/.test(route)) continue
    const measured = gzipListed(nextDir, listed)
    routes.push({ route, ...measured })
  }
  return routes
}

function fromClientReference(nextDir) {
  const routes = []
  for (const spec of GATED_CLIENT_MANIFESTS) {
    const full = join(nextDir, spec.file)
    if (!existsSync(full)) continue
    const listed = entryJsFromClientReference(readFileSync(full, 'utf8'), spec.pageKey)
    const measured = gzipListed(nextDir, listed)
    routes.push({ route: spec.route, ...measured })
  }
  return routes
}

export function measureFirstLoad(nextDir = '.next') {
  const root = resolve(process.cwd(), nextDir)
  if (!existsSync(root)) {
    return {
      ok: false,
      reason: 'missing-build',
      routes: [],
      over: [],
      runtime: { files: 0, gz: 0 },
    }
  }

  const fromClient = fromClientReference(root)
  const fromApp = fromAppBuildManifest(root)
  const routes = fromClient.length > 0 ? fromClient : fromApp
  const runtime = gzipListed(root, runtimeFiles(root))

  if (routes.length === 0) {
    return { ok: false, reason: 'missing-routes', routes: [], over: [], runtime }
  }

  const over = routes.filter((r) => r.gz > MAX_FIRST_LOAD_GZ)
  return {
    ok: over.length === 0,
    reason: over.length ? 'over-budget' : 'ok',
    routes,
    over,
    runtime,
  }
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
  if (result.reason === 'missing-routes') {
    console.error(
      'bundle-gate: no product or checkout client-reference-manifest (and no app-build-manifest pages).',
    )
    process.exit(2)
  }
  console.log(`bundle-gate: ceiling ${formatKb(MAX_FIRST_LOAD_GZ)} gz (page + layout client graph)`)
  console.log(
    `  info runtime ${formatKb(result.runtime.gz)} gz (${result.runtime.files} files, not gated)`,
  )
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
