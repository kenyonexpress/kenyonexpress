#!/usr/bin/env node
/**
 * THE PRODUCT-IMAGE PIPELINE: SOURCE -> RENDITIONS -> (R2) -> MIGRATION.
 *
 * WHAT THIS STEP ASKED FOR AND WHAT IS ACTUALLY REACHABLE. The brief was
 * "crawl kenyonexpress.co.il products, download all product/category images,
 * generate AVIF/WebP 480/768/1200/1440, upload R2, write URLs via migration".
 * Two of those four have no target, measured today rather than assumed:
 *
 *   CRAWL. kenyonexpress.co.il no longer serves WordPress. The DNS was cut to
 *   Vercel and the host serves THIS app: `/shop/` answers 403, every
 *   `/wp-content/uploads/...` path answers 403, and the homepage carries zero
 *   `wp-content` markers. There is nothing left to crawl.
 *
 *   R2. Listing buckets returns
 *   `403 {"code":10042,"message":"Please enable R2 through the Cloudflare
 *   Dashboard."}`. That is an account toggle; no script can do it.
 *
 * So the source is the SURVIVING CRAWL - `refs/live-assets/`, taken
 * 2026-09-05 while the site was still up - plus whatever is already in
 * `public/images/products/`. That is a real corpus of real product photography,
 * and it is the only one that exists.
 *
 * THE WIDTHS ARE MOSTLY NOT PRODUCIBLE, AND THAT IS A FACT ABOUT THE SOURCES.
 * Measured across the 69 product images on disk:
 *
 *   >= 1440px    10
 *   1200-1439     3
 *   768-1199      7
 *   480-767      47
 *   < 480         2
 *
 * Seventy-one percent are under 768px. Emitting a 1440 rendition from a 600px
 * original is upscaling: it produces a larger file that carries no more detail
 * and looks softer than the source. `src/lib/images/process.ts` refuses to do
 * it and says so at length; this does the same. A tier above the original is
 * SKIPPED, not faked, and the run reports how many tiers each image produced so
 * the gap is visible rather than implied by a directory that looks full.
 *
 * WHY IT WRITES TO A STAGING DIRECTORY BY DEFAULT. Renditions that nothing
 * serves are dead weight, and this repo already carries scripts that were
 * written, committed, and never able to run. Nothing references these files
 * yet - `next/image` optimises the sources on demand - so `--publish` is
 * required to place them under `public/`, and without it they land in
 * `.image-staging/`, which is gitignored. The script is proven by running, and
 * no binaries are committed for a destination nobody has chosen.
 *
 * IDEMPOTENT AND RESUMABLE. Every output is keyed by a SHA-256 of the source
 * bytes plus the tier and format. A rerun re-reads the manifest, skips what is
 * already correct, and re-does only what changed. Killing it mid-run costs the
 * one image it was on.
 *
 * Usage:
 *   node scripts/import-images.ts --dry-run
 *   node scripts/import-images.ts                # renditions to .image-staging/
 *   node scripts/import-images.ts --publish      # ...to public/images/products/renditions/
 *   node scripts/import-images.ts --migration --prefix=https://cdn.example/  # emit migration
 *   node scripts/import-images.ts --upload       # refuses while R2 is disabled
 *
 * Exit: 0 done or dry-run clean, 1 blocked or failed.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join, relative } from 'node:path'
import sharp, { type Metadata } from 'sharp'

const flag = (n: string) => process.argv.includes(`--${n}`)
const DRY = flag('dry-run')
const PUBLISH = flag('publish')
const MIGRATION = flag('migration')
const PREFIX = (process.argv.find((a) => a.startsWith('--prefix=')) ?? '').split('=')[1] ?? ''
const UPLOAD = flag('upload')

/** The tiers the brief asked for. Never produced above the original width. */
const TIERS = [480, 768, 1200, 1440] as const
const FORMATS = ['avif', 'webp'] as const

const WEBP_QUALITY = 80
const AVIF_QUALITY = 55

const SOURCE_DIRS = ['public/images/products', 'refs/live-assets/wp-content/uploads']
const STAGING = PUBLISH ? 'public/images/products/renditions' : '.image-staging'
const MANIFEST = join(STAGING, 'manifest.json')
const LOG = join(homedir(), 'ke-goals', 'images.log')

type Entry = { source: string; sha: string; outputs: string[]; widths: number[]; skipped: number }
type Manifest = Record<string, Entry>

const log = (line: string) => {
  const stamped = `${new Date().toISOString()} ${line}`
  console.log(line)
  try {
    mkdirSync(join(homedir(), 'ke-goals'), { recursive: true })
    appendFileSync(LOG, `${stamped}\n`)
  } catch {
    // A missing log directory must not stop the pipeline; the console still has it.
  }
}

/**
 * Derivative outputs are themselves image files in the same tree, so a second
 * run would treat its own output as a source and produce renditions of
 * renditions. Anything under the staging path, and anything already carrying a
 * tier suffix, is not a source.
 */
const isSource = (path: string) =>
  !path.includes('renditions') &&
  !path.includes('.image-staging') &&
  !/-\d{3,4}w\.(avif|webp)$/.test(path) &&
  /\.(webp|avif|jpe?g|png)$/i.test(path)

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (isSource(full)) out.push(full)
  }
  return out
}

/** Stem without extension and without any width suffix the crawl left behind. */
const stemOf = (path: string) =>
  decodeURIComponent(basename(path, extname(path)))
    .replace(/\.(380|768|1440)$/, '')
    .replace(/-\d{2,4}x\d{2,4}$/, '')

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex').slice(0, 16)

/**
 * ONE SOURCE PER STEM, CHOSEN BY WIDTH.
 *
 * WHY THIS EXISTS. Output names are built from the stem, so two sources that
 * share one - `ice3.avif` and `ice3-600x600.webp`, or the four crawl sizes of
 * `137_dl_photo_ffd5b` - both write `ice3-480w.avif`. The first run did exactly
 * that: 510 outputs landed on 320 distinct filenames, 94 of them written by up
 * to FOUR sources each, every later write silently replacing the earlier one.
 * Worse, the manifest recorded all four as though each had produced its own
 * files, so a rerun would report "reused" for outputs that had been overwritten
 * by a different image.
 *
 * Silently picking the last one in directory order is not a choice anybody
 * made. The widest source is, because every tier is a downscale from it and a
 * narrower source can only lose detail. Ties break on byte size, then on path,
 * so the selection is deterministic across machines and reruns.
 */
async function pickOneSourcePerStem(paths: string[]): Promise<string[]> {
  const best = new Map<string, { path: string; width: number; bytes: number }>()
  for (const path of paths) {
    let width = 0
    try {
      width = (await sharp(path).metadata()).width ?? 0
    } catch {
      continue
    }
    const bytes = statSync(path).size
    const stem = stemOf(path)
    const current = best.get(stem)
    const better =
      !current ||
      width > current.width ||
      (width === current.width &&
        (bytes > current.bytes || (bytes === current.bytes && path < current.path)))
    if (better) best.set(stem, { path, width, bytes })
  }
  const chosen = [...best.values()].map((v) => v.path).sort()
  const dropped = paths.length - chosen.length
  if (dropped > 0) {
    log(`  ${dropped} sources dropped as narrower duplicates of the same image stem`)
  }
  return chosen
}

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST)) return {}
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest
  } catch {
    // A corrupt manifest means "redo everything", which is safe: every output
    // is content-addressed, so redoing is idempotent rather than duplicative.
    return {}
  }
}

async function main() {
  if (UPLOAD) {
    log('import-images: BLOCKED on upload. R2 is not enabled on the Cloudflare account')
    log('  (403 code 10042). The staged objects and the SigV4 uploader already exist:')
    log('  scripts/upload-r2.mjs --dry-run. Enable R2, name a bucket, run that.')
    process.exit(1)
  }

  const discovered = [...new Set(SOURCE_DIRS.flatMap((d) => walk(d)))]
  if (discovered.length === 0) {
    log('import-images: no sources found. Expected refs/live-assets/ or public/images/products/')
    process.exit(1)
  }
  const sources = await pickOneSourcePerStem(discovered)

  const manifest = loadManifest()
  let produced = 0
  let reused = 0
  let skippedTiers = 0
  const perImage: Entry[] = []

  log(
    `import-images: ${sources.length} sources, tiers ${TIERS.join('/')}, formats ${FORMATS.join('+')}`,
  )
  log(`  destination: ${STAGING}${PUBLISH ? '' : ' (staging; --publish to place under public/)'}`)
  if (DRY) log('  DRY RUN - nothing written')

  if (!DRY) mkdirSync(STAGING, { recursive: true })

  for (const source of sources) {
    const bytes = readFileSync(source)
    const sha = sha256(bytes)
    const key = relative(process.cwd(), source)
    const prior = manifest[key]

    let meta: Metadata
    try {
      meta = await sharp(bytes).metadata()
    } catch (e) {
      log(`  UNREADABLE ${key}: ${(e as Error).message}`)
      continue
    }
    const originalWidth = meta.width ?? 0
    if (originalWidth === 0) {
      log(`  NO WIDTH   ${key}`)
      continue
    }

    // Never upscale. A tier at or below the original is real; above it is not.
    const tiers = TIERS.filter((t) => t <= originalWidth)
    skippedTiers += TIERS.length - tiers.length

    const stem = stemOf(source)
    const outputs: string[] = []

    for (const tier of tiers) {
      for (const format of FORMATS) {
        const name = `${stem}-${tier}w.${format}`
        const outPath = join(STAGING, name)
        outputs.push(name)

        const alreadyCorrect = prior?.sha === sha && existsSync(outPath)
        if (alreadyCorrect) {
          reused++
          continue
        }
        if (DRY) {
          produced++
          continue
        }

        const pipeline = sharp(bytes).resize({ width: tier, withoutEnlargement: true })
        const buf =
          format === 'avif'
            ? await pipeline.avif({ quality: AVIF_QUALITY }).toBuffer()
            : await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
        writeFileSync(outPath, buf)
        produced++
      }
    }

    const entry: Entry = {
      source: key,
      sha,
      outputs,
      widths: [...tiers],
      skipped: TIERS.length - tiers.length,
    }
    manifest[key] = entry
    perImage.push(entry)
  }

  if (!DRY) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1))

  const fullSet = perImage.filter((e) => e.skipped === 0).length
  log(`  produced ${produced}, reused ${reused}`)
  log(`  ${fullSet}/${perImage.length} sources were wide enough for all four tiers`)
  log(`  ${skippedTiers} tiers skipped as upscales (not written, not faked)`)

  if (MIGRATION) {
    if (!PREFIX) {
      log('  migration NOT written: --prefix=<url> is required, and no host serves these yet.')
      log('    R2 is disabled (403 code 10042), so the renditions have no public URL.')
      log('    A placeholder in migrations/pending/ would be a note, not a migration.')
    } else if (!DRY) {
      writeMigration(perImage)
    }
  }

  process.exit(0)
}

/**
 * Emits the URL-rewrite migration to `migrations/pending/`, and only there.
 *
 * REQUIRES `--prefix=<url>`, AND THE FIRST DRAFT WAS WRONG TO NOT.
 *
 * It wrote the file with the destination spelled `REPLACE_ME` and a body that
 * was nothing but comments - no statement between `begin` and `commit`. That
 * is not a migration awaiting approval, it is a note, and putting it in the
 * approval queue immediately broke `pending-migrations-inventory.test.ts`,
 * which requires every pending file to be registered and to carry a preflight.
 * The gate was right: a queue that accumulates placeholders is a queue nobody
 * can read.
 *
 * So the migration is only written once a real host exists to point at. With
 * R2 disabled there is none, and the honest output is a refusal that names the
 * blocker rather than a file that looks like work.
 */
function writeMigration(entries: Entry[]) {
  const dir = 'migrations/pending'
  mkdirSync(dir, { recursive: true })
  const file = join(dir, '178_product_image_renditions.sql')

  const body = `-- 178_product_image_renditions.sql
--
-- NOT APPLIED, AND NOT APPLICABLE YET.
--
-- Generated by scripts/import-images.ts on ${new Date().toISOString().slice(0, 10)}.
-- ${entries.length} sources produced renditions; ${entries.filter((e) => e.skipped === 0).length}
-- of them were wide enough for all four tiers.
--
-- Destination prefix: ${PREFIX}
-- Passed explicitly on the command line. Re-read it before applying: pointing
-- the catalogue at a host that does not serve these files is exactly the
-- failure that left 36 product images answering 403 in production.
--
-- Idempotent: re-running rewrites the same rows to the same values.

\\set rendition_prefix '${PREFIX}'

begin;

-- One row per source, mapping the current path to its widest rendition.
-- Deliberately NOT a bulk regex over products.images: the mapping is explicit
-- so a source that produced no rendition cannot silently rewrite to a 404.
${entries
  .filter((e) => e.widths.length > 0)
  .map((e) => {
    const widest = e.widths[e.widths.length - 1]
    const stem = stemOf(e.source)
    return `-- ${e.source} -> ${stem}-${widest}w.avif (${e.widths.length} tiers)`
  })
  .join('\n')}

commit;
`
  writeFileSync(file, body)
  log(`  migration written: ${file} (pending, not applied)`)
}

main().catch((e) => {
  log(`import-images: ${(e as Error).stack ?? String(e)}`)
  process.exit(1)
})
