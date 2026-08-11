import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { log } from '@/lib/observability/log'
import sharp from 'sharp'
import type { ZipEntry } from './zip'

/**
 * The images a `.pkpass` must carry, derived from the PWA icon that is already
 * in the repo rather than added as four more binary files.
 *
 * `icon.png` is NOT optional. A pass without it installs and then shows as a
 * blank card, or fails outright depending on the iOS version, and neither says
 * why. `logo.png` is what appears in the card header next to `logoText`.
 *
 * Apple's sizes: icon 29pt, logo 160x50pt, at 1x/2x/3x. Only the 1x and 2x are
 * emitted — 3x adds a third copy of the same bytes for a device class that
 * renders the 2x acceptably, and every byte here is in a download a customer
 * makes on mobile data at a counter.
 *
 * MEASURED, NOT ASSUMED: sharp failures are surfaced. The image optimizer in
 * this project has already been caught swallowing a sharp exception and serving
 * the source file byte for byte with a 200 and no log; a pass built the same
 * way would carry a 192x192 PNG named `icon.png` and be rejected on the phone
 * with nothing written anywhere.
 */

const SOURCE = path.join(process.cwd(), 'public', 'icons', 'icon-512.png')

const TARGETS: readonly { name: string; width: number; height: number }[] = [
  { name: 'icon.png', width: 29, height: 29 },
  { name: 'icon@2x.png', width: 58, height: 58 },
  { name: 'logo.png', width: 160, height: 50 },
  { name: 'logo@2x.png', width: 320, height: 100 },
]

let cached: ZipEntry[] | null = null

export async function passImages(): Promise<ZipEntry[]> {
  if (cached) return cached

  const source = await readFile(SOURCE)
  const entries: ZipEntry[] = []
  for (const target of TARGETS) {
    const data = await sharp(source)
      // `contain` and not `cover`: the logo is 160x50 and the source is square,
      // so cover would crop the mark down to a stripe of its middle.
      .resize(target.width, target.height, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toBuffer()
    if (data.length === 0) throw new Error(`wallet: ${target.name} came back empty`)
    entries.push({ name: target.name, data })
  }

  log.debug('wallet.pass_images_built', {
    count: entries.length,
    bytes: entries.reduce((sum, e) => sum + e.data.length, 0),
  })
  cached = entries
  return cached
}

/** Test seam. Never called by application code. */
export function __resetPassImageCache(): void {
  cached = null
}
