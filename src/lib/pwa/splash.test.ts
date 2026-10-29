import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPLASH_DEVICES, SPLASH_IMAGES } from './splash'

describe('iOS splash images', () => {
  it.each(SPLASH_IMAGES.map((i) => i.url))('%s exists under public/', (url) => {
    expect(existsSync(resolve(process.cwd(), 'public', url.slice(1)))).toBe(true)
  })
  it('generator script uses the same device table', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/generate-pwa-splash.mjs'), 'utf8')
    for (const [w, h, d] of SPLASH_DEVICES) expect(script).toContain(`[${w}, ${h}, ${d}]`)
  })
})
