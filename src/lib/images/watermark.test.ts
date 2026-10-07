import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadWatermark, parseOpacity, resetWatermarkCache } from './watermark'

beforeEach(() => resetWatermarkCache())

describe('parseOpacity', () => {
  it('clamps to 0..1 and falls back on junk', () => {
    expect(parseOpacity(undefined)).toBe(0.35)
    expect(parseOpacity('0.5')).toBe(0.5)
    expect(parseOpacity('7')).toBe(1)
    expect(parseOpacity('-1')).toBe(0)
    expect(parseOpacity('abc')).toBe(0.35)
  })
})

describe('loadWatermark', () => {
  it('is null when the variable is unset or blank', async () => {
    expect(await loadWatermark({})).toBeNull()
    expect(await loadWatermark({ IMAGE_WATERMARK_FILE: '  ' })).toBeNull()
  })

  it('reads the file relative to the working directory with the configured opacity', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-'))
    const file = join(dir, 'mark.png')
    writeFileSync(file, Buffer.from('PNG-bytes'))
    const spec = await loadWatermark({
      IMAGE_WATERMARK_FILE: relative(process.cwd(), file),
      IMAGE_WATERMARK_OPACITY: '0.6',
    })
    expect(spec?.image.toString()).toBe('PNG-bytes')
    expect(spec?.opacity).toBe(0.6)
  })

  it('is null, not a throw, when the file is missing', async () => {
    expect(await loadWatermark({ IMAGE_WATERMARK_FILE: 'does/not/exist.png' })).toBeNull()
  })
})
