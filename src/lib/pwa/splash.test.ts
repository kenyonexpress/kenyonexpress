import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SPLASH_SCREENS, splashFileName, splashMedia, startupImages } from './splash'

/** Width and height from a PNG's IHDR chunk, no image library needed. */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path)
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('iOS launch images', () => {
  it('ships every declared screen at exactly its pixel size', () => {
    for (const screen of SPLASH_SCREENS) {
      const size = pngSize(`public/splash/${splashFileName(screen)}`)
      expect(size, screen.devices).toEqual({
        width: screen.width * screen.ratio,
        height: screen.height * screen.ratio,
      })
    }
  })

  it('has one media query per screen, and no two screens share one', () => {
    const medias = SPLASH_SCREENS.map(splashMedia)
    expect(new Set(medias).size).toBe(medias.length)
    expect(splashMedia(SPLASH_SCREENS[0] as (typeof SPLASH_SCREENS)[number])).toBe(
      'screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
    )
  })

  it('keeps every launch image small: a solid canvas with one mark', () => {
    for (const screen of SPLASH_SCREENS) {
      const bytes = readFileSync(`public/splash/${splashFileName(screen)}`).byteLength
      expect(bytes, screen.devices).toBeLessThan(40_000)
    }
  })

  it('startupImages points at /splash/ with the same media', () => {
    const images = startupImages()
    expect(images).toHaveLength(SPLASH_SCREENS.length)
    expect(images[0]?.url).toBe('/splash/splash-750x1334.png')
  })
})
