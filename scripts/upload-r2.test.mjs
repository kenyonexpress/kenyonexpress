import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * C69 (2026-10-25): Tests for upload-r2.mjs rate limiting, resume, and cost cap.
 * The script exports no functions, so we test the patterns it uses via isolated
 * implementations. A full integration test runs the script in --dry-run mode.
 */

describe('RateLimiter', () => {
  class RateLimiter {
    constructor(maxOpsPerMinute) {
      this.maxOps = maxOpsPerMinute
      this.window = []
    }

    async waitIfNeeded() {
      const now = Date.now()
      const cutoff = now - 60000
      this.window = this.window.filter((t) => t > cutoff)

      if (this.window.length >= this.maxOps) {
        const oldestOp = this.window[0]
        const waitMs = oldestOp + 60000 - now
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs))
          return this.waitIfNeeded()
        }
      }

      this.window.push(Date.now())
    }

    getWindowSize() {
      const now = Date.now()
      const cutoff = now - 60000
      return this.window.filter((t) => t > cutoff).length
    }
  }

  it('allows operations under the limit', async () => {
    const limiter = new RateLimiter(50)
    for (let i = 0; i < 10; i++) {
      await limiter.waitIfNeeded()
    }
    expect(limiter.getWindowSize()).toBe(10)
  })

  it('tracks operations in a 60-second window', async () => {
    const limiter = new RateLimiter(50)
    const now = Date.now()
    limiter.window = [now - 70000, now - 30000, now - 5000]
    expect(limiter.getWindowSize()).toBe(2) // only last two in window
  })

  it('calculates correct wait time when at limit', () => {
    const limiter = new RateLimiter(3)
    const now = Date.now()
    limiter.window = [now - 59900, now - 100, now - 50] // 3 ops, oldest expires in 100ms

    const cutoff = now - 60000
    const inWindow = limiter.window.filter((t) => t > cutoff)
    expect(inWindow.length).toBe(3)

    // Would need to wait ~100ms for oldest to expire
    const oldestOp = limiter.window[0]
    const waitMs = oldestOp + 60000 - now
    expect(waitMs).toBeGreaterThan(0)
    expect(waitMs).toBeLessThan(200)
  })
})

describe('state persistence', () => {
  let testDir

  beforeEach(() => {
    testDir = join(tmpdir(), `upload-r2-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  function loadState(path) {
    if (!existsSync(path)) return { uploaded: new Set(), timestamp: Date.now() }
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'))
      return { uploaded: new Set(data.uploaded || []), timestamp: data.timestamp || Date.now() }
    } catch {
      return { uploaded: new Set(), timestamp: Date.now() }
    }
  }

  function saveState(path, uploaded) {
    writeFileSync(
      path,
      JSON.stringify({ uploaded: Array.from(uploaded), timestamp: Date.now() }, null, 2),
      'utf8',
    )
  }

  it('saves and loads uploaded object keys', () => {
    const statePath = join(testDir, '.upload-state.json')
    const uploaded = new Set(['key1', 'key2', 'key3'])
    saveState(statePath, uploaded)

    const loaded = loadState(statePath)
    expect(loaded.uploaded.size).toBe(3)
    expect(loaded.uploaded.has('key1')).toBe(true)
    expect(loaded.uploaded.has('key2')).toBe(true)
    expect(loaded.uploaded.has('key3')).toBe(true)
  })

  it('returns empty set for missing state file', () => {
    const statePath = join(testDir, '.missing.json')
    const loaded = loadState(statePath)
    expect(loaded.uploaded.size).toBe(0)
  })

  it('returns empty set for corrupted state file', () => {
    const statePath = join(testDir, '.corrupt.json')
    writeFileSync(statePath, '{invalid json}', 'utf8')
    const loaded = loadState(statePath)
    expect(loaded.uploaded.size).toBe(0)
  })
})

describe('progress formatting', () => {
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  function formatDuration(ms) {
    const sec = Math.floor(ms / 1000)
    if (sec < 60) return `${sec}s`
    const min = Math.floor(sec / 60)
    const s = sec % 60
    return `${min}m ${s}s`
  }

  it('formats bytes correctly', () => {
    expect(formatBytes(500)).toBe('500B')
    expect(formatBytes(1024)).toBe('1.0KB')
    expect(formatBytes(1536)).toBe('1.5KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0MB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5MB')
  })

  it('formats duration correctly', () => {
    expect(formatDuration(5000)).toBe('5s')
    expect(formatDuration(59000)).toBe('59s')
    expect(formatDuration(60000)).toBe('1m 0s')
    expect(formatDuration(125000)).toBe('2m 5s')
  })
})

describe('cost cap logic', () => {
  it('limits upload list to max-ops', () => {
    const allObjects = Array.from({ length: 100 }, (_, i) => ({ key: `obj${i}` }))
    const maxOps = 25
    const alreadyUploaded = 10

    const cappedUpload = allObjects.slice(0, maxOps - alreadyUploaded)
    expect(cappedUpload.length).toBe(15)
  })

  it('respects total cap across resumed runs', () => {
    const allObjects = Array.from({ length: 100 }, (_, i) => ({ key: `obj${i}` }))
    const maxOps = 30
    const uploaded = new Set(['obj0', 'obj1', 'obj2', 'obj3', 'obj4']) // 5 already done

    const toUpload = allObjects.filter((o) => !uploaded.has(o.key))
    const cappedUpload = toUpload.slice(0, maxOps - uploaded.size)

    expect(toUpload.length).toBe(95)
    expect(cappedUpload.length).toBe(25) // 30 total - 5 already done
  })
})

describe('upload-r2.mjs dry-run', () => {
  it('runs without errors in dry-run mode', async () => {
    const { execSync } = await import('node:child_process')
    const output = execSync('node scripts/upload-r2.mjs --dry-run', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'pipe',
    })

    expect(output).toMatch(/upload-r2:/)
    expect(output).toMatch(/DRY RUN/)
    expect(output).toMatch(/objects/)
  })
})
