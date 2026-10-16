import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isAllowedImageUrl } from '@/lib/images/remote-hosts'
import { siteUrl } from '@/lib/site-url'
import sharp from 'sharp'

/**
 * A catalogue image turned into something Satori can actually draw.
 *
 * WHY THIS IS NOT JUST `<img src={product.images[0]}>`.
 *
 * 1. FORMAT. Satori rasterises through resvg, and this catalogue is WebP and
 *    AVIF end to end: every file under `public/images/products` is `.webp`,
 *    and the pipeline renditions are AVIF. Handing those to `ImageResponse`
 *    does not degrade, it THROWS, and a throw in a share-image route is a
 *    broken preview beside a live link. sharp is already a direct dependency
 *    (pinned to 0.35.3 in `pnpm-workspace.yaml`, precisely because 0.34.5 could
 *    not decode this repo's AVIFs) so the decode is free to do here and the
 *    card gets a PNG it is guaranteed to understand.
 *
 * 2. SIZE. The card draws these at 280px. Inlining a 600x600 source as base64
 *    would put roughly a third more bytes than the file itself through Satori
 *    for a tile nobody zooms into. Resizing first is what keeps a card's
 *    render bounded regardless of what an admin uploaded.
 *
 * 3. REACH. `images` is admin-entered text. Fetching whatever it holds from a
 *    server-side route is a request this origin makes to an address someone
 *    else chose, so the value goes through `isAllowedImageUrl`, the same gate
 *    `next/image` and the admin forms use, and a same-origin path is read off
 *    the disk rather than fetched back through the network at all.
 *
 * EVERY FAILURE RETURNS NULL. Not a throw, not a placeholder URL: null, and the
 * templates draw their no-image variant. A card with no photo is a card; a card
 * that 500s is a grey box in somebody's chat.
 */

/** Bytes accepted from a remote host. Above this the image is not drawn. */
const MAX_SOURCE_BYTES = 8_000_000

/** A remote fetch that hangs must not hold the whole card hostage. */
const FETCH_TIMEOUT_MS = 3_000

export interface ImageTile {
  /** `data:image/png;base64,...`, ready for a Satori `<img>`. */
  src: string
  width: number
  height: number
}

/**
 * A same-origin path (`/images/products/x.webp`) read off disk.
 *
 * `path.resolve` then a prefix check, rather than trusting the leading slash:
 * the value comes from a column an admin writes, and `/../../.env.local` is a
 * perfectly ordinary-looking string until it is joined onto a directory.
 */
async function readFromPublic(pathname: string): Promise<Buffer | null> {
  const publicDir = path.join(process.cwd(), 'public')
  const resolved = path.resolve(publicDir, `.${decodeURIComponent(pathname)}`)
  if (resolved !== publicDir && !resolved.startsWith(`${publicDir}${path.sep}`)) return null
  try {
    return await readFile(resolved)
  } catch {
    return null
  }
}

async function fetchRemote(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // The card is regenerated on the CDN's schedule, not the origin's; a
      // conditional request would only add a round trip.
      cache: 'no-store',
    })
    if (!response.ok) return null
    const declared = Number(response.headers.get('content-length') ?? '0')
    if (declared > MAX_SOURCE_BYTES) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    // Checked again on the body: `content-length` is a claim, not a limit, and
    // a chunked response does not carry one at all.
    return bytes.byteLength > MAX_SOURCE_BYTES ? null : bytes
  } catch {
    return null
  }
}

async function toPng(bytes: Buffer, box: number): Promise<ImageTile | null> {
  try {
    const { data, info } = await sharp(bytes)
      .rotate() // Honour EXIF orientation; phone photos reach this table sideways.
      .resize(box, box, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true })
    return {
      src: `data:image/png;base64,${data.toString('base64')}`,
      width: info.width,
      height: info.height,
    }
  } catch {
    return null
  }
}

/**
 * One catalogue image URL, as a square PNG tile of `box` pixels, or null.
 *
 * `box` is the drawn size, so a 280px tile costs 280px of PNG. Callers pass the
 * number the template actually renders at.
 */
export async function imageTile(
  raw: string | null | undefined,
  box: number,
): Promise<ImageTile | null> {
  const value = raw?.trim()
  if (!value || !isAllowedImageUrl(value)) return null

  const bytes = value.startsWith('/') ? await readFromPublic(value) : await fetchRemote(value)
  return bytes ? toPng(bytes, box) : null
}

/**
 * The site wordmark, decoded once per instance.
 *
 * `public/images/logo.webp` is the same asset the header renders, and it is
 * WebP (exactly the format Satori cannot read), so the logo needs the
 * same treatment as a product photo. It is the one image on every card, so it
 * is memoised as a promise; a failure clears the memo rather than blanking the
 * mark for the life of the lambda.
 */
const LOGO_WIDTH = 228
const LOGO_HEIGHT = 60

let logoCache: Promise<ImageTile | null> | null = null

async function loadLogo(): Promise<ImageTile | null> {
  const bytes = await readFromPublic('/images/logo.webp')
  if (!bytes) return null
  try {
    const { data, info } = await sharp(bytes)
      .resize(LOGO_WIDTH, LOGO_HEIGHT, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true })
    return {
      src: `data:image/png;base64,${data.toString('base64')}`,
      width: info.width,
      height: info.height,
    }
  } catch {
    return null
  }
}

export function logoTile(): Promise<ImageTile | null> {
  logoCache ??= loadLogo().catch(() => {
    logoCache = null
    return null
  })
  return logoCache
}

/** The domain line every card carries, without the scheme. */
export function siteHost(): string {
  try {
    return new URL(siteUrl()).host
  } catch {
    return 'kenyonexpress.co.il'
  }
}
