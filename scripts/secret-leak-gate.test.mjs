import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { P0_SECRET_NAMES, run, scan, secretCandidates } from './secret-leak-gate.mjs'

let dir

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'secret-leak-gate-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('secretCandidates', () => {
  it('finds a plausible secret-shaped var not prefixed NEXT_PUBLIC_', () => {
    const found = secretCandidates({ SUPABASE_SECRET_KEY: 'sk_live_deadbeef1234' })
    expect(found).toEqual([{ name: 'SUPABASE_SECRET_KEY', value: 'sk_live_deadbeef1234' }])
  })

  it('excludes anything prefixed NEXT_PUBLIC_, secret-shaped name or not', () => {
    const found = secretCandidates({ NEXT_PUBLIC_SUPABASE_SECRET_KEY: 'sk_live_deadbeef1234' })
    expect(found).toEqual([])
  })

  it('excludes a value shorter than 8 chars, the "true"/"false" false-positive case', () => {
    const found = secretCandidates({ CHECKOUT_TOKEN: 'true' })
    expect(found).toEqual([])
  })

  it('excludes a name with no secret-shaped word in it', () => {
    const found = secretCandidates({ NODE_ENV: 'production-value-long-enough' })
    expect(found).toEqual([])
  })
})

describe('scan', () => {
  it('finds a candidate VALUE embedded in a file', () => {
    const file = join(dir, 'chunk.js')
    writeFileSync(file, 'const x = "sk_live_deadbeef1234"')
    const findings = scan(
      [file],
      [{ name: 'SUPABASE_SECRET_KEY', value: 'sk_live_deadbeef1234' }],
      [],
    )
    expect(findings).toEqual([{ file, name: 'SUPABASE_SECRET_KEY', kind: 'value' }])
  })

  it('finds a P0 secret NAME embedded in a file, independent of any value', () => {
    const file = join(dir, 'chunk.js')
    writeFileSync(file, 'window.__ENV__ = {"CRON_SECRET": window.__leaked__}')
    const findings = scan([file], [], ['CRON_SECRET'])
    expect(findings).toEqual([{ file, name: 'CRON_SECRET', kind: 'name' }])
  })

  it('reports nothing for a clean file', () => {
    const file = join(dir, 'chunk.js')
    writeFileSync(file, 'const x = 1')
    const findings = scan(
      [file],
      [{ name: 'SUPABASE_SECRET_KEY', value: 'sk_live_deadbeef1234' }],
      P0_SECRET_NAMES,
    )
    expect(findings).toEqual([])
  })

  it('skips a file it cannot read rather than throwing', () => {
    const findings = scan([join(dir, 'does-not-exist.js')], [], [])
    expect(findings).toEqual([])
  })
})

describe('run (the fixture the task asks for)', () => {
  it('exits 2 when .next/static is missing', () => {
    const code = run(join(dir, 'nope'), {})
    expect(code).toBe(2)
  })

  it('exits 2 when .next/static exists but is empty', () => {
    const code = run(dir, {})
    expect(code).toBe(2)
  })

  it('exits 0 on a clean fixture', () => {
    writeFileSync(join(dir, 'chunk.js'), 'console.log("hello world")')
    const code = run(dir, { SUPABASE_SECRET_KEY: 'sk_live_deadbeef1234' })
    expect(code).toBe(0)
  })

  it('exits 1 and names the variable when a planted value is found', () => {
    writeFileSync(join(dir, 'chunk.js'), 'const leaked = "sk_live_deadbeef1234"')
    const code = run(dir, { SUPABASE_SECRET_KEY: 'sk_live_deadbeef1234' })
    expect(code).toBe(1)
  })

  it('exits 1 on a planted P0 name even with no matching value in the environment', () => {
    writeFileSync(join(dir, 'chunk.js'), 'JSON.stringify({CARDCOM_API_PASSWORD: x})')
    const code = run(dir, {})
    expect(code).toBe(1)
  })

  it('only scans known text extensions, ignoring a binary-looking file', () => {
    writeFileSync(join(dir, 'font.woff2'), 'sk_live_deadbeef1234')
    const code = run(dir, { SUPABASE_SECRET_KEY: 'sk_live_deadbeef1234' })
    expect(code).toBe(0)
  })

  it('descends into subdirectories, matching a real .next/static/chunks layout', () => {
    mkdirSync(join(dir, 'chunks'), { recursive: true })
    writeFileSync(join(dir, 'chunks', 'app.js'), 'const leaked = "sk_live_deadbeef1234"')
    const code = run(dir, { SUPABASE_SECRET_KEY: 'sk_live_deadbeef1234' })
    expect(code).toBe(1)
  })
})
