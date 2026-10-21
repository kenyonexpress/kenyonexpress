import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCompareArgs } from './compare-args.mjs'

/**
 * F43 (2026-10-21): the goal queue invoked the gate with `--widths=`,
 * `--baseline=` and `--live-url=`, and compare.mjs ignored all three in
 * silence, so the literal command measured something else and printed a
 * number. These pin what each flag means now, and that the script and
 * package.json actually consume the parser rather than process.argv.
 */
describe('parseCompareArgs', () => {
  const never = () => false
  const always = () => true

  it('defaults to home at 1440 with a fresh reference shot', () => {
    expect(parseCompareArgs([], { exists: never })).toEqual({
      page: 'home',
      width: 1440,
      widths: [],
      underTest: null,
      baseline: null,
    })
  })

  it('reads --width singular as before', () => {
    expect(parseCompareArgs(['--page=cart', '--width=380'], { exists: never })).toMatchObject({
      page: 'cart',
      width: 380,
      widths: [],
    })
  })

  it('treats a single --widths value as --width', () => {
    expect(parseCompareArgs(['--widths=380'], { exists: never })).toMatchObject({
      width: 380,
      widths: [380],
    })
  })

  it('fans a comma list out in order and lets --widths beat --width', () => {
    expect(
      parseCompareArgs(['--width=1440', '--widths=380, 768'], { exists: never }),
    ).toMatchObject({
      width: 380,
      widths: [380, 768],
    })
  })

  it('rejects a width that is not a positive integer', () => {
    expect(() => parseCompareArgs(['--widths=380,phone'], { exists: never })).toThrow(/--widths/)
  })

  it('maps --live-url to the server under test, not the reference', () => {
    const args = parseCompareArgs(['--live-url=http://localhost:3311'], { exists: never })
    expect(args.underTest).toBe('http://localhost:3311')
  })

  it('resolves a bare --baseline name under refs/', () => {
    const seen = []
    const args = parseCompareArgs(['--baseline=electro-v7-380.png'], {
      exists: (p) => {
        seen.push(p)
        return p.endsWith(resolve('refs', 'electro-v7-380.png'))
      },
    })
    expect(args.baseline).toEqual({
      name: 'electro-v7-380.png',
      path: resolve('refs', 'electro-v7-380.png'),
    })
    expect(seen[0]).toBe(resolve('electro-v7-380.png'))
  })

  it('refuses a --baseline that names no file, and says where it looked', () => {
    expect(() => parseCompareArgs(['--baseline=nope.png'], { exists: never })).toThrow(
      /names no file.*refs/s,
    )
  })

  it('keeps an absolute --baseline path as given', () => {
    const args = parseCompareArgs(['--baseline=/tmp/ref.png'], { exists: always })
    expect(args.baseline?.path).toBe('/tmp/ref.png')
  })
})

describe('the gate consumes the parser', () => {
  const compare = readFileSync(resolve('scripts/compare.mjs'), 'utf8')
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))

  it('imports parseCompareArgs and reads width, widths, baseline and the server under test from it', () => {
    expect(compare).toMatch(/import \{ parseCompareArgs \} from '\.\/compare-args\.mjs'/)
    expect(compare).toMatch(/ARGS\.widths\.length > 1/)
    expect(compare).toMatch(/ARGS\.baseline/)
    expect(compare).toMatch(/ARGS\.underTest/)
  })

  it('names the baseline in the ledger notes so a frozen run is never read as a fresh shot', () => {
    expect(compare).toMatch(/baseline \$\{ARGS\.baseline\.name\}/)
  })

  it('exposes the gate as `pnpm run compare`', () => {
    expect(pkg.scripts.compare).toBe('node scripts/compare.mjs')
  })
})
