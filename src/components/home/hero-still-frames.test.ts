import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { ANIMATED_WEBP_SOURCES, HERO_STILL_FRAMES } from './HeroSlider'

/**
 * An animated hero source is the one hole in the image pipeline: next/image
 * cannot resize it without killing the animation, so it is `unoptimized` and
 * ships its whole authored weight to every viewport. One 777KB file put the
 * homepage's mobile LCP at 10.1s, worse than the recorded baseline, while every
 * other image on the page left the optimizer between 56KB and 97KB.
 *
 * The fix is a still frame served below the desktop breakpoint, and it is only
 * as good as the map that pairs the two. These tests guard the pairing rather
 * than the markup, because the failure mode is silent: adding an animated slide
 * with no still entry renders correctly, passes review, and quietly puts the
 * full file back on every phone. Nothing in a screenshot or a type would catch
 * it.
 */
const publicPath = (webPath: string) => resolve('public', webPath.replace(/^\//, ''))

describe('hero still frames', () => {
  it('pairs every animated source with a still', () => {
    for (const src of ANIMATED_WEBP_SOURCES) {
      expect(HERO_STILL_FRAMES[src], `no still frame registered for ${src}`).toBeTruthy()
    }
  })

  it('registers no still for a source that is not animated', () => {
    for (const src of Object.keys(HERO_STILL_FRAMES)) {
      expect(ANIMATED_WEBP_SOURCES.has(src), `${src} has a still but is not animated`).toBe(true)
    }
  })

  for (const [animated, still] of Object.entries(HERO_STILL_FRAMES)) {
    describe(animated, () => {
      it('ships both files', () => {
        expect(existsSync(publicPath(animated))).toBe(true)
        expect(existsSync(publicPath(still))).toBe(true)
      })

      it('is animated, and its still is not', async () => {
        const source = await sharp(publicPath(animated), { animated: true }).metadata()
        const frame = await sharp(publicPath(still), { animated: true }).metadata()

        expect(source.pages ?? 1).toBeGreaterThan(1)
        // A single page is what makes the still optimizable at all. If a future
        // regeneration leaves it animated, next/image passes it through whole
        // and the saving disappears with nothing else changing.
        expect(frame.pages ?? 1).toBe(1)
      })

      it('keeps the still at the source frame size, so the optimizer can scale it', async () => {
        const source = await sharp(publicPath(animated), { animated: true }).metadata()
        const frame = await sharp(publicPath(still)).metadata()

        expect(frame.width).toBe(source.width)
        expect(frame.height).toBe(source.pageHeight)
      })

      it('is far lighter as a still than as an animation', () => {
        const animatedBytes = statSync(publicPath(animated)).size
        const stillBytes = statSync(publicPath(still)).size

        // The whole point of the exercise. 4x is a floor, not a target: the
        // shipped pair is about 9x apart, and what actually reaches a phone is
        // smaller again because the still goes through the optimizer.
        expect(stillBytes * 4).toBeLessThan(animatedBytes)
      })
    })
  }
})
