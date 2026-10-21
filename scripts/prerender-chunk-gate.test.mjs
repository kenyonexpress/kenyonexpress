import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractChunkRefs,
  findMissingChunks,
  formatMissing,
  listPrerenderedHtml,
  scanDist,
  toDistPath,
} from './prerender-chunk-gate.mjs'

/**
 * The shape of the 2026-10-21 defect, pinned: a prerendered page lists a chunk
 * the build never wrote. Lighthouse cannot see it (perf 99, TBT 0 ms); the
 * browser sees a 404 and the page never hydrates.
 */
const HOME_HTML = [
  '<!DOCTYPE html><html><head>',
  '<link rel="stylesheet" href="/_next/static/chunks/0cz1d0mv5g_q7.css" data-precedence="next"/>',
  '<script src="/_next/static/chunks/turbopack-3yv6cmuran_d1.js" async=""></script>',
  '<script src="/_next/static/chunks/1drezw6i2ptzn.js" async=""></script>',
  '<script src="/_next/static/chunks/1k-r7teo-59oi.js" async=""></script>',
  '</head><body><script>self.__next_f.push([1,"{\\"c\\":[\\"static/chunks/1k-r7teo-59oi.js\\"]}"])</script>',
  '<script src="/_next/static/chunks/1drezw6i2ptzn.js" async=""></script>',
  '</body></html>',
].join('')

describe('extractChunkRefs', () => {
  it('returns each referenced js and css chunk once, sorted', () => {
    expect(extractChunkRefs(HOME_HTML)).toEqual([
      '/_next/static/chunks/0cz1d0mv5g_q7.css',
      '/_next/static/chunks/1drezw6i2ptzn.js',
      '/_next/static/chunks/1k-r7teo-59oi.js',
      '/_next/static/chunks/turbopack-3yv6cmuran_d1.js',
    ])
  })

  it('ignores the bare static/chunks strings inside the flight payload', () => {
    // Those are relative to the runtime's own base and resolve to the same
    // files as the script tags; counting them would double-report.
    const refs = extractChunkRefs(HOME_HTML)
    expect(refs.every((r) => r.startsWith('/_next/'))).toBe(true)
  })

  it('finds nothing in HTML without chunks', () => {
    expect(extractChunkRefs('<html><body>hi</body></html>')).toEqual([])
  })
})

describe('toDistPath', () => {
  it('maps the served URL to the file under the build directory', () => {
    expect(toDistPath('/_next/static/chunks/a.js')).toBe('static/chunks/a.js')
  })
})

describe('findMissingChunks', () => {
  it('names the page and the chunk when the build did not write the file', () => {
    const onDisk = new Set([
      'static/chunks/0cz1d0mv5g_q7.css',
      'static/chunks/1drezw6i2ptzn.js',
      'static/chunks/turbopack-3yv6cmuran_d1.js',
    ])
    const missing = findMissingChunks([{ page: 'server/app/index.html', html: HOME_HTML }], (p) =>
      onDisk.has(p),
    )
    expect(missing).toEqual([
      { page: 'server/app/index.html', chunk: '/_next/static/chunks/1k-r7teo-59oi.js' },
    ])
  })

  it('is empty when every reference resolves', () => {
    expect(findMissingChunks([{ page: 'x', html: HOME_HTML }], () => true)).toEqual([])
  })

  it('a page with no chunk references is not a failure', () => {
    expect(findMissingChunks([{ page: 'x', html: '<p/>' }], () => false)).toEqual([])
  })
})

describe('formatMissing', () => {
  it('groups pages under the chunk they share', () => {
    const text = formatMissing([
      { page: 'server/app/index.html', chunk: '/_next/static/chunks/k.js' },
      { page: 'server/app/product/x.html', chunk: '/_next/static/chunks/k.js' },
    ])
    expect(text).toContain('/_next/static/chunks/k.js')
    expect(text).toContain('server/app/index.html, server/app/product/x.html')
    expect(text.match(/k\.js/g)).toHaveLength(1)
  })
})

describe('scanDist on a build directory', () => {
  let dist
  afterEach(() => {
    if (dist) rmSync(dist, { recursive: true, force: true })
    dist = undefined
  })

  const makeDist = () => {
    dist = mkdtempSync(join(tmpdir(), 'ke-chunk-gate-'))
    mkdirSync(join(dist, 'server/app/product'), { recursive: true })
    mkdirSync(join(dist, 'server/route-cache/APP_PAGE/abc/$'), { recursive: true })
    mkdirSync(join(dist, 'static/chunks'), { recursive: true })
    writeFileSync(join(dist, 'BUILD_ID'), 'test')
    writeFileSync(join(dist, 'server/app/index.html'), HOME_HTML)
    writeFileSync(join(dist, 'server/app/product/x.html'), HOME_HTML)
    writeFileSync(join(dist, 'server/route-cache/APP_PAGE/abc/$/index.html'), HOME_HTML)
    writeFileSync(join(dist, 'server/app/index.rsc'), 'not html, not scanned')
    for (const f of ['0cz1d0mv5g_q7.css', '1drezw6i2ptzn.js', 'turbopack-3yv6cmuran_d1.js']) {
      writeFileSync(join(dist, 'static/chunks', f), '')
    }
    return dist
  }

  it('scans server/app and server/route-cache html, nothing else', () => {
    const d = makeDist()
    const files = listPrerenderedHtml(d).map((f) => f.slice(d.length + 1))
    expect(files).toEqual([
      'server/app/index.html',
      'server/app/product/x.html',
      'server/route-cache/APP_PAGE/abc/$/index.html',
    ])
  })

  it('reports the stale chunk from every page that asks for it', () => {
    const d = makeDist()
    const { pagesChecked, missing } = scanDist(d)
    expect(pagesChecked).toBe(3)
    expect(missing.map((m) => m.chunk)).toEqual([
      '/_next/static/chunks/1k-r7teo-59oi.js',
      '/_next/static/chunks/1k-r7teo-59oi.js',
      '/_next/static/chunks/1k-r7teo-59oi.js',
    ])
  })

  it('is clean once the chunk is on disk', () => {
    const d = makeDist()
    writeFileSync(join(d, 'static/chunks/1k-r7teo-59oi.js'), '')
    expect(scanDist(d).missing).toEqual([])
  })
})
