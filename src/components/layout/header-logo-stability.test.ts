import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE HEADER LOGO HAS A CSS ASPECT RATIO, AND IT IS THE FILE'S OWN.
 *
 * The logo is `priority` (it is in every first viewport) and its width is
 * `auto` because live paints it at 100x26 and 300x79, two boxes one class
 * cannot express with a fixed width. With only the width/height attributes,
 * Chrome sizes the box from 300/79 and then re-measures from the decoded
 * 380x100, and Lighthouse attributed the homepage's one layout shift to that
 * ("media element lacking an explicit size", 30.09.2026). `aspect-[19/5]`
 * is 380/100 reduced; the box is final before the bytes arrive.
 */
describe('header logo layout stability', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/components/layout/Header.tsx'), 'utf8')

  it('declares the logo aspect ratio in CSS and keeps the priority hint', () => {
    const logo = src.match(/<SmartImage[\s\S]*?\/>/)?.[0] ?? ''
    expect(logo).toMatch(/className="[^"]*aspect-\[19\/5\][^"]*"/)
    expect(logo).toMatch(/\bpriority\b/)
  })

  it('matches the file on disk (380x100)', () => {
    // WebP VP8X/VP8L/VP8 canvas size lives in the first 30 bytes; RIFF is
    // little-endian. A designer swapping the file to a new ratio must update
    // the class, and this is where that fails instead of on a phone.
    const buf = readFileSync(resolve(process.cwd(), 'public/images/logo.webp'))
    expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(buf.subarray(8, 12).toString('ascii')).toBe('WEBP')
    const chunk = buf.subarray(12, 16).toString('ascii')
    let width: number
    let height: number
    if (chunk === 'VP8X') {
      width = 1 + buf.readUIntLE(24, 3)
      height = 1 + buf.readUIntLE(27, 3)
    } else if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21)
      width = 1 + (b & 0x3fff)
      height = 1 + ((b >> 14) & 0x3fff)
    } else {
      width = buf.readUInt16LE(26) & 0x3fff
      height = buf.readUInt16LE(28) & 0x3fff
    }
    expect(width / height).toBeCloseTo(19 / 5, 3)
  })
})
