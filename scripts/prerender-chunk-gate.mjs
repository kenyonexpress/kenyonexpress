#!/usr/bin/env node
/**
 * Post-build gate: every `/_next/static/chunks/*` a prerendered page asks the
 * browser for must exist in the build that ships that page.
 *
 * Why this exists (2026-10-21, MAINTENANCE_LOOP_7). Next 16 keeps a Turbopack
 * filesystem cache for `next build` on by default
 * (`experimental.turbopackFileSystemCacheForBuild`, `.next/cache/turbopack`).
 * After four builds on one cache the prerendered HTML for `/` and
 * `/product/[slug]` listed a client chunk (`1k-r7teo-59oi.js`) that the same
 * build did not write to `.next/static/chunks/`. The server answered 404 with
 * `text/plain`, Chrome refused to execute it, the Turbopack runtime never got
 * its chunk group, and neither page hydrated: 0 of 53 buttons on the home page
 * carried a React handler. Lighthouse scored it 99 (TBT 0 ms, because no JS
 * ran). Pages rendered at request time were fine, because their HTML is
 * produced from the live module graph, not the cached one.
 *
 * A cold build (cache moved aside) fixed it. This gate turns the symptom into
 * an exit code so a stale cache cannot ship a dead storefront again.
 *
 * Usage: node scripts/prerender-chunk-gate.mjs [--dist .next]
 * Exit: 0 clean, 1 missing chunk(s), 2 nothing to check (no build on disk).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/** Matches the href/src of a static chunk as the prerendered HTML writes it. */
const CHUNK_REF = /\/_next\/static\/chunks\/[^"'\s<>)]+?\.(?:js|css)/g

/**
 * Every distinct chunk path a page's HTML references, in a stable order.
 * The match includes the `/_next` prefix; `toDistPath` maps it to disk.
 * @param {string} html
 * @returns {string[]}
 */
export function extractChunkRefs(html) {
  return [...new Set(html.match(CHUNK_REF) ?? [])].sort()
}

/**
 * `/_next/static/chunks/x.js` is served from `<distDir>/static/chunks/x.js`.
 * @param {string} ref
 */
export function toDistPath(ref) {
  return ref.replace(/^\/_next\//, '')
}

/**
 * Pure core: which referenced chunks are absent.
 * @param {{ page: string, html: string }[]} pages
 * @param {(distRelativePath: string) => boolean} exists
 * @returns {{ page: string, chunk: string }[]}
 */
export function findMissingChunks(pages, exists) {
  const missing = []
  for (const { page, html } of pages) {
    for (const ref of extractChunkRefs(html)) {
      if (!exists(toDistPath(ref))) missing.push({ page, chunk: ref })
    }
  }
  return missing
}

/**
 * Prerendered HTML lives under `server/app/**` and, once the server has
 * revalidated anything, also under `server/route-cache/**`. Both are what a
 * visitor actually receives, so both are scanned.
 * @param {string} distDir absolute path to the build directory
 * @returns {string[]} absolute paths of every `.html` under the two roots
 */
export function listPrerenderedHtml(distDir) {
  const roots = ['server/app', 'server/route-cache'].map((r) => join(distDir, r))
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (name.endsWith('.html')) out.push(full)
    }
  }
  for (const root of roots) if (existsSync(root)) walk(root)
  return out.sort()
}

/**
 * Read the build on disk and report.
 * @param {string} distDir
 */
export function scanDist(distDir) {
  const files = listPrerenderedHtml(distDir)
  const pages = files.map((f) => ({
    page: relative(distDir, f),
    html: readFileSync(f, 'utf8'),
  }))
  const missing = findMissingChunks(pages, (p) => existsSync(join(distDir, p)))
  return { pagesChecked: pages.length, missing }
}

/**
 * @param {{ page: string, chunk: string }[]} missing
 */
export function formatMissing(missing) {
  const byChunk = new Map()
  for (const m of missing) {
    if (!byChunk.has(m.chunk)) byChunk.set(m.chunk, [])
    byChunk.get(m.chunk).push(m.page)
  }
  return [...byChunk.entries()]
    .map(([chunk, pages]) => `  ${chunk}\n    referenced by: ${pages.join(', ')}`)
    .join('\n')
}

function main() {
  const argv = process.argv.slice(2)
  const distFlag = argv.indexOf('--dist')
  const distDir = resolve(distFlag === -1 ? '.next' : argv[distFlag + 1])
  if (!existsSync(join(distDir, 'BUILD_ID'))) {
    console.error(
      `prerender chunk gate: no build at ${distDir} (BUILD_ID missing). Run pnpm build first.`,
    )
    process.exit(2)
  }
  const { pagesChecked, missing } = scanDist(distDir)
  if (pagesChecked === 0) {
    console.error(
      `prerender chunk gate: no prerendered HTML under ${distDir}/server. Nothing checked.`,
    )
    process.exit(2)
  }
  if (missing.length === 0) {
    console.log(
      `prerender chunk gate: clean (${pagesChecked} prerendered page(s), every referenced chunk is on disk)`,
    )
    process.exit(0)
  }
  console.error(
    `prerender chunk gate: ${missing.length} reference(s) to chunks the build did not write\n`,
  )
  console.error(formatMissing(missing))
  console.error('\nThese pages will not hydrate. Usual cause: a stale Turbopack build cache')
  console.error('(.next/cache/turbopack). Move it aside and build cold, then rerun this gate.')
  process.exit(1)
}

const invokedDirectly = (process.argv[1] ?? '').endsWith('prerender-chunk-gate.mjs')
if (invokedDirectly) main()
