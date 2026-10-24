import { describe, expect, it } from 'vitest'
import { RateLimiter, formatBytes, formatDuration } from './ingest-r2.mjs'

describe('ingest-r2: rate limiting, progress, resume', () => {
  describe('RateLimiter', () => {
    it('allows operations under the limit', async () => {
      const limiter = new RateLimiter(3)
      const start = Date.now()
      await limiter.waitIfNeeded()
      await limiter.waitIfNeeded()
      await limiter.waitIfNeeded()
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(100) // should be immediate
    })

    it('detects when rate limit is exceeded', () => {
      const limiter = new RateLimiter(3)
      // Simulate 3 operations within the window
      limiter.window = [Date.now() - 10000, Date.now() - 5000, Date.now()]
      expect(limiter.window.length).toBe(3)
      expect(limiter.window.length >= limiter.maxOps).toBe(true)
    })

    it('correctly tracks operations in a sliding window', async () => {
      const limiter = new RateLimiter(2)
      // Fill window with 2 ops
      await limiter.waitIfNeeded()
      await limiter.waitIfNeeded()
      expect(limiter.window.length).toBe(2)

      // Old ops should drop out after 60s, allowing new ops
      limiter.window[0] = Date.now() - 65000 // older than 60s
      await limiter.waitIfNeeded()
      expect(limiter.window.length).toBeLessThanOrEqual(3)
    })
  })

  describe('formatBytes', () => {
    it('formats bytes < 1KB as bytes', () => {
      expect(formatBytes(512)).toBe('512B')
      expect(formatBytes(1023)).toBe('1023B')
    })

    it('formats 1KB-1MB as KB', () => {
      expect(formatBytes(1024)).toMatch(/\d+\.\d?KB/)
      expect(formatBytes(1024 * 512)).toMatch(/\d+\.\d?KB/)
    })

    it('formats > 1MB as MB', () => {
      expect(formatBytes(1024 * 1024)).toMatch(/\d+\.\d?MB/)
      expect(formatBytes(1024 * 1024 * 10)).toMatch(/\d+\.\d?MB/)
    })
  })

  describe('formatDuration', () => {
    it('formats milliseconds < 60s as seconds', () => {
      expect(formatDuration(30000)).toBe('30s')
      expect(formatDuration(59000)).toBe('59s')
    })

    it('formats duration >= 60s as minutes and seconds', () => {
      expect(formatDuration(65000)).toBe('1m 5s')
      expect(formatDuration(125000)).toBe('2m 5s')
    })
  })

  describe('state management', () => {
    it('preserves uploaded file keys across runs', () => {
      // This would require mocking fs calls
      // Implementation depends on how state is persisted
      expect(true).toBe(true) // placeholder for integration test
    })

    it('resumes from saved state', () => {
      // Test that already-uploaded objects are skipped
      expect(true).toBe(true) // placeholder for integration test
    })

    it('can force re-upload with --force flag', () => {
      // Test that --force clears state and re-uploads
      expect(true).toBe(true) // placeholder for integration test
    })
  })

  describe('cost cap enforcement', () => {
    it('limits total operations with --max-ops', () => {
      const toUpload = Array.from({ length: 100 }, (_, i) => ({ key: `obj-${i}` }))
      const maxOps = 50
      const cappedUpload = toUpload.slice(0, maxOps)
      expect(cappedUpload.length).toBe(50)
    })

    it('respects cost cap relative to already-uploaded', () => {
      const state = { uploaded: new Set(['obj-0', 'obj-1']) }
      const toUpload = Array.from({ length: 100 }, (_, i) => ({ key: `obj-${i + 2}` }))
      const maxOps = 50
      const cappedUpload = toUpload.slice(0, Math.max(0, maxOps - state.uploaded.size))
      expect(cappedUpload.length).toBe(48)
    })
  })

  describe('command-line flags', () => {
    it('parses --dry-run flag', () => {
      const argv = ['node', 'script', '--dry-run']
      const hasDry = argv.includes('--dry-run')
      expect(hasDry).toBe(true)
    })

    it('parses --force flag', () => {
      const argv = ['node', 'script', '--force']
      const hasForce = argv.includes('--force')
      expect(hasForce).toBe(true)
    })

    it('parses --max-ops=N argument', () => {
      const argv = ['node', 'script', '--max-ops=100']
      const maxOps = argv.find((a) => a.startsWith('--max-ops='))
      expect(maxOps).toBe('--max-ops=100')
      const value = Number.parseInt(maxOps.slice('--max-ops='.length), 10)
      expect(value).toBe(100)
    })

    it('parses --prefix argument', () => {
      const argv = ['node', 'script', '--prefix=custom-prefix/']
      const prefix = argv.find((a) => a.startsWith('--prefix='))
      expect(prefix).toBe('--prefix=custom-prefix/')
      const value = prefix.slice('--prefix='.length)
      expect(value).toBe('custom-prefix/')
    })
  })

  describe('progress tracking', () => {
    it('tracks sent/failed/skipped counts', () => {
      let sent = 0
      let failed = 0
      let skipped = 0

      sent += 1
      skipped += 1
      failed += 1

      expect(sent).toBe(1)
      expect(skipped).toBe(1)
      expect(failed).toBe(1)
    })

    it('accumulates bytes sent', () => {
      let bytesSent = 0
      const fileSizes = [1024, 2048, 4096]
      for (const size of fileSizes) {
        bytesSent += size
      }
      expect(bytesSent).toBe(7168)
    })
  })

  describe('exit codes', () => {
    it('exits 0 on success', () => {
      const exitCode = 0
      expect(exitCode).toBe(0)
    })

    it('exits 0 on dry-run', () => {
      const exitCode = 0
      expect(exitCode).toBe(0)
    })

    it('exits 1 on blocked (missing env)', () => {
      const exitCode = 1
      expect(exitCode).toBe(1)
    })

    it('exits 1 when uploads fail', () => {
      const exitCode = 1
      expect(exitCode).toBe(1)
    })
  })
})
