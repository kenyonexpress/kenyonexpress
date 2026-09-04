/**
 * THE TEMPLATE-ASSET GATE: no Electro photography, and no other company's
 * product or brand imagery, ships from this repo.
 *
 * WHAT IT REPLACED. Twenty-one files under `public/images/hero/` were the
 * Electro demo kit, and eleven of them were rendering on the homepage above the
 * fold: an iPhone 11 Pro with AirPods (as a 777KB animated WebP that was, on its
 * own, the difference between this page and a 90+ mobile Lighthouse score), an
 * iPad Pro, two Samsung Gear smartwatches, a red phone, a MacBook, an Apple
 * silhouette, a Tesla mark, App Store and Google Play badges, and a mockup of
 * Electro's own storefront with the word "electro" still in its masthead.
 *
 * On a site that sells vouchers for restaurants, spas, hotels, courses and
 * tradespeople.
 *
 * WHY A DENYLIST BY NAME AND NOT A HEURISTIC. No scan can look at a JPEG and
 * tell whose product it is. What a scan CAN do is remember the exact filenames
 * that were removed and the vendor marks nobody should be shipping, so that
 * restoring one -- from the template, from live's uploads, from a git revert --
 * fails loudly instead of quietly.
 *
 * WHY LIVE IS NOT AN ESCAPE HATCH. kenyonexpress.co.il serves these same files
 * from its own wp-content/uploads, because it runs the same theme. "Source the
 * content from live" therefore cannot supply a replacement here, and the tie
 * goes to not shipping another company's product photography. The slots render
 * `BrandPlaceholder` until real photography exists.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = process.cwd()

/**
 * The exact files removed on 2026-09-04, by basename. Restoring any one of them
 * under any path fails the gate.
 */
export const REMOVED_TEMPLATE_ASSETS = [
  'ios13-iphone-11pro-airpods-pro-setup-animation-steps.webp',
  'ios13-iphone-11pro-airpods-pro-setup-animation-still.webp',
  'redPhone-1-1.png',
  'Smartwatches1.png',
  'iapdlap.png',
  'slider-img-3.png',
  'Screen-Shot-2021-11-09-at-6.41.46.png',
  'Screen-Shot-2021-11-12-at-0.20.17.png',
  'tesla-logo-main.webp',
  'apple-140-new.webp',
  'home-sl-da-3.webp',
]

/**
 * Vendor marks and product lines that are not ours to ship as DECORATION,
 * matched loosely on the filename.
 *
 * SCOPED TO THE CHROME, AND THE SCOPE IS THE WHOLE POINT. This runs over the
 * hero, the banners and the promo rails -- slots a designer fills with whatever
 * looks good. It deliberately does NOT run over `public/images/products/`,
 * because live's catalogue really does list a Samsung Galaxy S22, and its photo
 * of it is content sourced from live exactly as the rule requires. The first
 * version of this scan had no such scope and flagged that photo, which would
 * have meant deleting a product the store sells to satisfy a rule about
 * decoration.
 *
 * A photograph of a MacBook is somebody else's product shot whatever the file
 * is called; a file CALLED `macbook-hero.jpg` in a banner slot is one this can
 * catch. Not a judgement about the brands -- `GoogleLogo.tsx` reproduces
 * Google's sign-in mark to their guidelines and belongs there.
 */
const DECORATION_DIRS = ['public/images/hero', 'public/images/promo', 'public/images/banners']
const VENDOR_PATTERNS = [
  /\bairpods?\b/i,
  /\biphone\b/i,
  /\bipad\b/i,
  /\bmacbook\b/i,
  /\btesla\b/i,
  /\bgalaxy-s\d/i,
  /\bapp-?store\b/i,
  /\bgoogle-?play\b/i,
  /\belectro-(demo|theme|template)\b/i,
]

const IMAGE_EXT = /\.(png|jpe?g|webp|avif|gif|svg)$/i

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(relative(ROOT, full))
  }
  return out
}

function sourceFiles(dir = resolve(ROOT, 'src'), out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      sourceFiles(full, out)
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(relative(ROOT, full))
    }
  }
  return out
}

/** @returns {{where: string, asset: string, why: string}[]} */
export function scanTemplateAssets() {
  const offenders = []
  const removed = new Set(REMOVED_TEMPLATE_ASSETS.map((n) => n.toLowerCase()))

  for (const file of walk(resolve(ROOT, 'public/images'))) {
    if (!IMAGE_EXT.test(file)) continue
    const base = file.split('/').pop() ?? ''
    if (removed.has(base.toLowerCase())) {
      offenders.push({ where: file, asset: base, why: 'removed on 2026-09-04' })
      continue
    }
    if (!DECORATION_DIRS.some((dir) => file.startsWith(dir))) continue
    for (const pattern of VENDOR_PATTERNS) {
      if (pattern.test(base)) {
        offenders.push({ where: file, asset: base, why: `matches ${pattern}` })
        break
      }
    }
  }

  // A deleted file that something still points at is the same defect one step
  // earlier: it renders as a broken image rather than as somebody's product.
  for (const file of sourceFiles()) {
    const source = readFileSync(resolve(ROOT, file), 'utf8')
    for (const asset of REMOVED_TEMPLATE_ASSETS) {
      // The reference dump records live's own URLs on purpose; a LOCAL path is
      // what this is looking for.
      if (source.includes(`/images/hero/slider/${asset}`)) {
        offenders.push({ where: file, asset, why: 'local path to a deleted asset' })
      }
      if (source.includes(`/images/hero/side-banners/${asset}`)) {
        offenders.push({ where: file, asset, why: 'local path to a deleted asset' })
      }
    }
  }

  return offenders
}

export function formatTemplateAssets(offenders) {
  return offenders.map((o) => `  ${o.where}: ${o.asset} (${o.why})`).join('\n')
}

/** Bytes under public/images, so the gate can also report what was recovered. */
export function imageBytes() {
  return walk(resolve(ROOT, 'public/images'))
    .filter((f) => IMAGE_EXT.test(f))
    .reduce((total, f) => total + statSync(resolve(ROOT, f)).size, 0)
}
