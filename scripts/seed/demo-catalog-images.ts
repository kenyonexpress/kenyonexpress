/**
 * Demo catalogue images: an 800x800 placeholder per product and per supplier,
 * rendered from SVG with the Hebrew title, pushed through the application's
 * OWN pipeline (`src/lib/images/process.ts`: webp at 800 and 400, avif at 800,
 * blur placeholder) and stored through one of three sinks.
 *
 * WHY GENERATED AND NOT `refs/`. The surviving crawl in `refs/live-assets/`
 * holds 106 files, and `scripts/import-images.ts` measured that seventy-one
 * percent of the product photos are under 768px wide; the application refuses
 * to upscale (`validateImageDimensions` wants 800). Cropping the twenty that
 * are wide enough would also put real businesses' photographs on invented
 * businesses' listings. A labelled placeholder is honest about being one.
 *
 * SINKS, in the order the application itself falls back:
 *   r2        when the five R2_* variables are set (same names as src/lib/storage/r2.ts)
 *   supabase  Supabase Storage, bucket `product-images`, the application's fallback
 *   staging   `.image-staging/demo-catalog/` on disk; what a dry run uses, gitignored
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type ProcessedImage, processImage } from '@/lib/images/process'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import type { DemoCategorySlug } from './demo-catalog-data'

export const PLACEHOLDER_SIZE = 800

/** Supabase Storage bucket the admin upload action writes to when R2 is off. */
export const PRODUCT_IMAGES_BUCKET = 'product-images'

/** Where a dry run renders to. Covered by the `.image-staging/` gitignore line. */
export const STAGING_DIR = '.image-staging'

const HUES: Record<DemoCategorySlug, number> = {
  'hot-deals': 4,
  'under-99': 28,
  new: 164,
  'restaurants-cafes': 18,
  'beauty-health': 328,
  'phones-computers': 212,
  'baby-kids': 46,
  vacation: 192,
  pets: 96,
  professionals: 232,
  courses: 268,
}

export function categoryHue(slug: DemoCategorySlug): number {
  return HUES[slug]
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Greedy word wrap to at most `maxLines` lines of about `maxChars` each. */
export function wrapTitle(title: string, maxChars = 20, maxLines = 3): string[] {
  const words = title.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = `${kept[maxLines - 1]}…`
  return kept
}

export type PlaceholderSpec = {
  title: string
  caption: string
  hue: number
}

/**
 * The SVG. `direction="rtl"` with `text-anchor="middle"` keeps each Hebrew line
 * centred and read right to left; librsvg (sharp's SVG rasteriser) shapes
 * Hebrew correctly with the system fonts on this machine, verified by rendering
 * one and looking at it before this was written.
 */
export function placeholderSvg(spec: PlaceholderSpec): string {
  const size = PLACEHOLDER_SIZE
  const lines = wrapTitle(spec.title)
  const fontSize = lines.length > 2 ? 52 : 60
  const lineHeight = Math.round(fontSize * 1.3)
  const firstY = Math.round(size / 2 - ((lines.length - 1) * lineHeight) / 2)
  const titleText = lines
    .map(
      (line, i) =>
        `<text x="${size / 2}" y="${firstY + i * lineHeight}" font-size="${fontSize}" font-weight="700" fill="#ffffff" text-anchor="middle" direction="rtl" dominant-baseline="middle">${escapeXml(line)}</text>`,
    )
    .join('')
  const font = 'Arial Hebrew, Noto Sans Hebrew, Arial, Helvetica, sans-serif'
  const dark = `hsl(${spec.hue} 62% 30%)`
  const light = `hsl(${spec.hue} 70% 46%)`
  // An array join, not `+` between template literals: biome flags the
  // concatenation, and the production bundler has been measured to drop text
  // from exactly that shape (docs/STATE-ARCHIVE.md, template-literal concat).
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" font-family="${font}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>`,
    `<rect width="${size}" height="${size}" fill="url(#g)"/>`,
    `<circle cx="${size - 120}" cy="120" r="150" fill="#ffffff" fill-opacity="0.08"/>`,
    `<circle cx="140" cy="${size - 110}" r="200" fill="#000000" fill-opacity="0.08"/>`,
    titleText,
    `<text x="${size / 2}" y="${size - 96}" font-size="30" fill="#ffffff" fill-opacity="0.9" text-anchor="middle" direction="rtl">${escapeXml(spec.caption)}</text>`,
    `<rect x="40" y="40" width="112" height="44" rx="22" fill="#ffffff" fill-opacity="0.92"/>`,
    `<text x="96" y="63" font-size="24" font-weight="700" fill="${dark}" text-anchor="middle" dominant-baseline="middle">דמו</text>`,
    '</svg>',
  ]
  return parts.join('')
}

/** The 800x800 "original" the pipeline receives, as PNG. */
export async function renderPlaceholder(spec: PlaceholderSpec): Promise<Buffer> {
  return sharp(Buffer.from(placeholderSvg(spec)), { density: 96 })
    .resize(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE)
    .png()
    .toBuffer()
}

/** Original -> renditions, through the application's pipeline, unchanged. */
export async function buildImageSet(spec: PlaceholderSpec): Promise<ProcessedImage> {
  return processImage(await renderPlaceholder(spec))
}

export type ImageSink = {
  name: 'r2' | 'supabase' | 'staging'
  bucket: string | null
  put(key: string, body: Buffer, contentType: string): Promise<string>
}

export function createStagingSink(root = STAGING_DIR): ImageSink {
  return {
    name: 'staging',
    bucket: null,
    async put(key, body) {
      const path = join(root, key)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, body)
      return `staging://${path}`
    },
  }
}

export function createSupabaseStorageSink(
  admin: SupabaseClient,
  bucket = PRODUCT_IMAGES_BUCKET,
): ImageSink {
  return {
    name: 'supabase',
    bucket,
    async put(key, body, contentType) {
      const { error } = await admin.storage
        .from(bucket)
        .upload(key, body, { contentType, cacheControl: '31536000', upsert: true })
      if (error) throw new Error(`storage ${bucket}/${key}: ${error.message}`)
      return admin.storage.from(bucket).getPublicUrl(key).data.publicUrl
    },
  }
}

export type R2Env = {
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET?: string
  R2_PUBLIC_BASE_URL?: string
}

export function isR2Env(env: R2Env): env is Required<R2Env> {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_PUBLIC_BASE_URL,
  )
}

export function createR2Sink(env: Required<R2Env>): ImageSink {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  })
  const base = env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')
  return {
    name: 'r2',
    bucket: env.R2_BUCKET,
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      )
      return `${base}/${key}`
    },
  }
}

export type StoredImageSet = {
  mainUrl: string
  blurDataURL: string
  width: number
  height: number
  webp: { w: number; url: string }[]
  avif: { w: number; url: string }[]
  bytes: number
}

/** Keys are `${baseKey}/w${width}.${format}`, the admin upload action's shape. */
export async function storeImageSet(
  sink: ImageSink,
  baseKey: string,
  processed: ProcessedImage,
): Promise<StoredImageSet> {
  const webp: { w: number; url: string }[] = []
  const avif: { w: number; url: string }[] = []
  let bytes = 0
  for (const rendition of processed.renditions) {
    const key = `${baseKey}/w${rendition.width}.${rendition.format}`
    const url = await sink.put(key, rendition.buffer, `image/${rendition.format}`)
    bytes += rendition.buffer.byteLength
    ;(rendition.format === 'webp' ? webp : avif).push({ w: rendition.width, url })
  }
  const main = webp[0]
  if (!main) throw new Error(`${baseKey}: pipeline produced no webp rendition`)
  return {
    mainUrl: main.url,
    blurDataURL: processed.blurDataURL,
    width: processed.width,
    height: processed.height,
    webp,
    avif,
    bytes,
  }
}
