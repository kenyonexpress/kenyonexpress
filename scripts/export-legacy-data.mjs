#!/usr/bin/env node
// Promote the frozen WordPress crawl into data/legacy/*.json.
//
// WHY A COPY AND NOT A REFERENCE
//
// `wp_import/` is the pipeline's scratch space: raw API pages, downloaded
// media, per-run validation reports, and 3,800 log files. It is where a run
// happens. `data/legacy/` is what the run PRODUCED and what the rest of the
// codebase is allowed to depend on -- the redirect builder reads it, the test
// suite reads it, and neither should have to know that a `.jsonl` log lives
// two directories over.
//
// The copy is lossy in exactly one direction and that is the point. Every
// normalised row carries a `raw_post` / `raw_meta` / `raw` blob holding the
// full WordPress payload it was derived from; those blobs are 85% of the bytes
// (701KB of the 780KB in products.json alone) and nothing reads them. They stay
// in `wp_import/normalized/`, which is not going anywhere, and `$raw_kept_in`
// on each file says exactly where to look.
//
// THIS IS EVIDENCE, NOT CONFIGURATION
//
// The crawl ran once, on 2026-08-11, against a site that has since been
// replaced. Nothing here should ever be edited to make a downstream problem go
// away: it is the only surviving record of what the old site served, and a
// corrected copy of evidence is not evidence. Corrections belong in
// scripts/build-legacy-redirects.mjs, which reads this and writes its own
// artefact with the reason for every departure recorded next to it.

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'wp_import/normalized')
const OUT = join(ROOT, 'data/legacy')

/** The mtime of the normalised file: when the crawl that produced it ran. */
const crawledAt = (name) => statSync(join(SRC, name)).mtime.toISOString()

const read = (name) => JSON.parse(readFileSync(join(SRC, name), 'utf8'))

const strip = (rows, keys) =>
  rows.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k))))

function emit(outName, srcName, what, rows, stripped) {
  const body = {
    $what: what,
    $source: `wp_import/normalized/${srcName}`,
    $crawled_at: crawledAt(srcName),
    $site: 'https://kenyonexpress.co.il (WordPress + WooCommerce, retired)',
    $frozen:
      'Evidence of what the old site served. Never edit to fix a downstream problem; ' +
      'corrections belong in the consumer, with the reason recorded.',
    ...(stripped.length
      ? { $raw_kept_in: `wp_import/normalized/${srcName}`, $stripped: stripped }
      : {}),
    $count: rows.length,
    rows,
  }
  const path = join(OUT, outName)
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`)
  console.log(`${path}  ${rows.length} rows`)
}

mkdirSync(OUT, { recursive: true })

emit(
  'products.json',
  'products.json',
  'Every WooCommerce product the crawl found, normalised.',
  strip(read('products.json'), ['raw_post', 'raw_meta']),
  ['raw_post', 'raw_meta'],
)

emit(
  'categories.json',
  'categories.json',
  'Every WooCommerce product category, with the Hebrew slug the old URLs used.',
  strip(read('categories.json'), ['raw']),
  ['raw'],
)

emit(
  'images.json',
  'media.json',
  'Every media attachment referenced by a product, with its source URL and local derivatives.',
  strip(read('media.json'), ['raw']),
  ['raw'],
)

// The URL inventory keeps every field. It is the smallest file and every column
// in it is load-bearing for the redirect builder.
emit(
  'url-inventory.json',
  'url_inventory.json',
  'Every URL the old site served, with the mapping rule the pipeline chose for it.',
  read('url_inventory.json'),
  [],
)
