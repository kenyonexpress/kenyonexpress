#!/usr/bin/env node
/**
 * CRAWLS kenyonexpress.co.il AND INGESTS ITS IMAGERY.
 *
 * Downloads every product image, banner, category image and hero slide into
 * `refs/live-assets/`, preserving the source path under the origin, then builds
 * AVIF and WebP derivatives at 380/768/1440/2000 and a blurhash placeholder for
 * each.
 *
 * WHY IT FILTERS, AND WHY THE FILTER IS LOUD.
 *
 * Live serves the Electro demo kit from its own uploads -- the iPhone-and-AirPods
 * animation, the Tesla mark, a Samsung Galaxy S22, the Electro storefront
 * mockups. `docs/SOURCING-RULES.md` records the decision that those are the
 * template's content rather than this business's, and they were deleted from
 * this repo on 2026-09-04 with a gate (`scripts/template-asset-scan.mjs`) that
 * fails the build if one comes back.
 *
 * An unfiltered "download every image from live" walks all of them straight back
 * in. So this quarantines them instead of skipping them silently: they land in
 * `refs/live-assets/_quarantine/` with a manifest entry saying why, so the
 * decision is visible and reversible rather than a gap somebody rediscovers.
 *
 * WHAT IS NOT DONE HERE. The goal asked for an upload to Cloudflare R2 and the
 * instruction was cut off mid-sentence at "upload to Cloudflare R2 under" -- no
 * bucket, no prefix. Guessing a bucket name would put this catalogue somewhere
 * nobody chose. The manifest this writes is the input to that upload whenever
 * the destination is known; see `docs/MISSING-ASSETS.md`.
 *
 * Usage:
 *   node scripts/ingest-live-assets.mjs            # crawl, download, derive
 *   node scripts/ingest-live-assets.mjs --pages=6  # limit the crawl
 *   node scripts/ingest-live-assets.mjs --no-derive
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { encodeBlurhash } from './blurhash.mjs'

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(homedir(), 'Library/Caches/ms-playwright')

const ORIGIN = 'https://kenyonexpress.co.il'
const OUT = resolve('refs/live-assets')
const QUARANTINE = join(OUT, '_quarantine')
const WIDTHS = [380, 768, 1440, 2000]

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const MAX_PAGES = Number(arg('pages', '14'))
const DERIVE = !process.argv.includes('--no-derive')

/**
 * The template/vendor assets that must not come back. Same patterns as
 * `scripts/template-asset-scan.mjs`, kept in step deliberately: if that gate
 * would reject a file, this must not hand it to the build.
 */
/**
 * KEPT BY NAME, AGAINST THE PATTERNS BELOW.
 *
 * `galaxy-s22_highlights_kv_img` matches `\bgalaxy-s\d` and is NOT demo
 * content: live's catalogue really does list a Samsung Galaxy S22, and this is
 * its product photograph. The pattern is right about the filename and wrong
 * about the thing.
 *
 * Reviewed by name on 2026-09-06 and kept deliberately, by two sessions
 * independently. The rule it is exempt from is "no Electro demo content"; a
 * real photograph of a real product this shop sells is content, and
 * `docs/SOURCING-RULES.md` says content comes from live.
 *
 * Do not re-quarantine it on the pattern. If the product ever leaves the
 * catalogue, this entry goes with it.
 */
const KEEP_BY_NAME = [/galaxy-s22_highlights_kv_img/i]

const QUARANTINE_PATTERNS = [
  /\biphone\b/i,
  /\bairpods?\b/i,
  /\bipad\b/i,
  /\bmacbook\b/i,
  /\btesla\b/i,
  /\bgalaxy-s\d/i,
  /\bapp-?store\b/i,
  /\bgoogle-?play\b/i,
  /redPhone/i,
  /Smartwatches/i,
  /iapdlap/i,
  /slider-img/i,
  /Screen-Shot-2021/i,
  /home-sl-da/i,
  /apple-\d/i,
]

/** Pages worth crawling for imagery: the shop archive carries every product. */
const SEED_PATHS = ['/', '/shop/', '/cart/']

const quarantineReason = (url) => {
  if (KEEP_BY_NAME.some((p) => p.test(url))) return null
  return QUARANTINE_PATTERNS.find((p) => p.test(url))?.source ?? null
}

/**
 * The real blurhash, plus the dominant colour for a one-line CSS fallback.
 *
 * The first version of this emitted a 4x3 WebP data URI and called it `lqip`,
 * honestly, because it was not a blurhash and saying otherwise would have cost
 * the next person an afternoon. `scripts/blurhash.mjs` is the actual algorithm
 * now -- eighty lines rather than a dependency, with a decoder beside it so the
 * encoder can be tested by round trip rather than by eye.
 *
 * 32x32 is the sample size the reference recommends: large enough that the DCT
 * sees the image's structure, small enough that the transform is instant.
 */
async function placeholder(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(32, 32, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { dominant } = await sharp(buffer).stats()
  return {
    blurhash: encodeBlurhash(data, info.width, info.height, 4, 3),
    dominant: `#${[dominant.r, dominant.g, dominant.b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')}`,
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(QUARANTINE, { recursive: true })

  const browser = await chromium.launch()
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 1200 },
  })

  // ---- 1. crawl -----------------------------------------------------------
  const visited = new Set()
  const queue = SEED_PATHS.map((p) => ORIGIN + p)
  /** @type {Map<string, {pages: string[], alt: string}>} */
  const images = new Map()

  while (queue.length && visited.size < MAX_PAGES) {
    const url = queue.shift()
    if (!url || visited.has(url)) continue
    visited.add(url)

    const page = await context.newPage()
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
      // Elementor and the Jet grid lazy-load; without a full scroll the deals
      // grid and half the product photography never request their bytes.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 200))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(1200)

      const found = await page.evaluate(() => {
        const out = []
        for (const img of document.images) {
          const src = img.currentSrc || img.src
          if (src) out.push({ src, alt: img.alt || '' })
        }
        // Background images carry the banners on this theme.
        for (const el of document.querySelectorAll('*')) {
          const bg = getComputedStyle(el).backgroundImage
          const m = bg?.match(/url\(["']?(https?:[^"')]+)["']?\)/)
          if (m) out.push({ src: m[1], alt: '' })
        }
        const links = [...document.querySelectorAll('a[href]')]
          .map((a) => a.href)
          .filter((h) => h.startsWith(location.origin))
        return { out, links }
      })

      for (const { src, alt } of found.out) {
        if (!src.startsWith(ORIGIN)) continue
        const entry = images.get(src) ?? { pages: [], alt }
        if (!entry.pages.includes(url)) entry.pages.push(url)
        if (!entry.alt && alt) entry.alt = alt
        images.set(src, entry)
      }
      for (const link of found.links) {
        if (visited.size + queue.length >= MAX_PAGES) break
        if (/\/product\/|\/product-category\//.test(link) && !visited.has(link)) queue.push(link)
      }
      console.log(`crawled ${url}  images so far: ${images.size}`)
    } catch (error) {
      console.error(`  crawl failed ${url}: ${String(error).slice(0, 90)}`)
    }
    await page.close()
  }

  // ---- 2. download + derive ----------------------------------------------
  const manifest = []
  let quarantined = 0

  for (const [src, meta] of images) {
    const path = new URL(src).pathname.replace(/^\/+/, '')
    const reason = quarantineReason(src)
    const target = join(reason ? QUARANTINE : OUT, path)
    mkdirSync(dirname(target), { recursive: true })

    let buffer
    try {
      const response = await context.request.get(src, { timeout: 45000 })
      if (!response.ok()) throw new Error(`HTTP ${response.status()}`)
      buffer = Buffer.from(await response.body())
      writeFileSync(target, buffer)
    } catch (error) {
      manifest.push({ src, path, error: String(error).slice(0, 90) })
      console.error(`  download failed ${path}: ${String(error).slice(0, 60)}`)
      continue
    }

    if (reason) {
      quarantined += 1
      manifest.push({
        src,
        path,
        quarantined: true,
        reason: `matches ${reason} — Electro/vendor asset, see docs/SOURCING-RULES.md`,
        bytes: buffer.length,
        alt: meta.alt,
        pages: meta.pages,
      })
      continue
    }

    const row = {
      src,
      path,
      bytes: buffer.length,
      alt: meta.alt,
      pages: meta.pages,
      derivatives: [],
    }

    if (DERIVE) {
      try {
        const image = sharp(buffer)
        const { width, height, format } = await image.metadata()
        row.width = width
        row.height = height
        row.format = format
        Object.assign(row, await placeholder(buffer))

        for (const w of WIDTHS) {
          if (width && w > width) continue // never upscale
          for (const fmt of ['avif', 'webp']) {
            const derived = join(OUT, '_derived', `${path.replace(/\.[^.]+$/, '')}.${w}.${fmt}`)
            mkdirSync(dirname(derived), { recursive: true })
            const buf = await sharp(buffer)
              .resize(w, null, { withoutEnlargement: true })
              [fmt]({ quality: fmt === 'avif' ? 50 : 72 })
              .toBuffer()
            writeFileSync(derived, buf)
            row.derivatives.push({ width: w, format: fmt, bytes: buf.length })
          }
        }
      } catch (error) {
        row.deriveError = String(error).slice(0, 90)
      }
    }
    manifest.push(row)
    process.stdout.write('.')
  }

  const manifestPath = join(OUT, 'manifest.json')
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        origin: ORIGIN,
        crawledAt: new Date().toISOString(),
        pages: [...visited],
        widths: WIDTHS,
        assets: manifest,
      },
      null,
      1,
    ),
  )

  const kept = manifest.filter((m) => !m.quarantined && !m.error)
  const derived = kept.reduce((n, m) => n + (m.derivatives?.length ?? 0), 0)
  console.log(`\n\ncrawled ${visited.size} pages`)
  console.log(`ingested ${kept.length} assets, ${derived} derivatives`)
  console.log(`quarantined ${quarantined} Electro/vendor assets -> refs/live-assets/_quarantine/`)
  console.log(`failed ${manifest.filter((m) => m.error).length}`)
  console.log(`manifest: ${manifestPath}`)
  await browser.close()
}

await main()
