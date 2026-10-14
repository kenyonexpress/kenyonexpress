import { describe, expect, it, vi } from 'vitest'
import {
  MARKER,
  findStickyComment,
  redact,
  renderPreviewComment,
  upsertStickyComment,
} from './comment.mjs'

const base = { pr: 72, sha: 'abcdef1234567890' }

describe('renderPreviewComment', () => {
  it('always starts with the marker and wraps the Hebrew body in an RTL container', () => {
    for (const phase of ['ready', 'failed', 'skipped', 'torn-down']) {
      const body = renderPreviewComment({ ...base, phase, preview: {}, supabase: {} })
      expect(body.startsWith(`${MARKER}\n<div dir="rtl">`)).toBe(true)
      expect(body.trimEnd().endsWith('</div>')).toBe(true)
      expect(body).not.toContain('—')
    }
    expect(() => renderPreviewComment({ ...base, phase: 'nope' })).toThrow(/unknown phase/)
  })

  it('ready: names the stable URL, the branch ref, the short sha and the teardown promise', () => {
    const body = renderPreviewComment({
      ...base,
      phase: 'ready',
      preview: {
        url: 'https://kenyonexpress-prod-pr-72.vercel.app',
        deploymentUrl: 'https://k-abc.vercel.app',
      },
      supabase: {
        name: 'pr-72',
        ref: 'aaaaaaaaaaaaaaaaaaaa',
        status: 'ACTIVE_HEALTHY',
        withData: true,
        created: true,
      },
    })
    expect(body).toContain('https://kenyonexpress-prod-pr-72.vercel.app')
    expect(body).toContain('https://k-abc.vercel.app')
    expect(body).toContain('`abcdef1`')
    expect(body).toContain('`pr-72`')
    expect(body).toContain('`aaaaaaaaaaaaaaaaaaaa`')
    expect(body).toContain('נמחקים אוטומטית')
    expect(body).toContain('עותק של הסכימה והנתונים')
  })

  it('skipped: lists the missing secrets so the comment is actionable', () => {
    const body = renderPreviewComment({
      ...base,
      phase: 'skipped',
      missing: ['SUPABASE_ACCESS_TOKEN', 'VERCEL_TOKEN'],
    })
    expect(body).toContain('`SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`')
    expect(body).toContain('docs/PREVIEW-DEPLOYMENTS.md')
  })

  it('failed: carries the redacted error and the run link, and says the branch was kept', () => {
    const body = renderPreviewComment({
      ...base,
      phase: 'failed',
      error: 'POST /v13/deployments -> 403: Bearer abc.def.ghi rejected; key sb_secret_ABC123',
      runUrl: 'https://github.com/o/r/actions/runs/1',
      supabase: { name: 'pr-72', ref: 'aaaaaaaaaaaaaaaaaaaa' },
    })
    expect(body).toContain('https://github.com/o/r/actions/runs/1')
    expect(body).not.toContain('sb_secret_ABC123')
    expect(body).toContain('Bearer [redacted]')
    expect(body).toContain('נשאר')
  })

  it('torn-down: reports each half separately', () => {
    const body = renderPreviewComment({
      ...base,
      phase: 'torn-down',
      supabase: { name: 'pr-72', deleted: true },
      removedEnvKeys: ['A', 'B', 'C'],
      aliasRemoved: false,
    })
    expect(body).toContain('נמחק')
    expect(body).toContain('הוסרו 3')
    expect(body).toContain('לא הייתה מוקצית')
  })
})

describe('redact', () => {
  it('blanks bearer tokens, Supabase access tokens, new-format keys and JWTs', () => {
    const jwt = `eyJ${'a'.repeat(12)}.${'b'.repeat(12)}.${'c'.repeat(12)}`
    const out = redact(
      `Bearer sbp_123abc and sbp_zzz and sb_publishable_Q1 and sb_secret_Q2 and ${jwt} end`,
    )
    expect(out).toBe(
      'Bearer [redacted] and sbp_[redacted] and sb_publishable_[redacted] and sb_secret_[redacted] and [jwt redacted] end',
    )
  })
})

describe('upsertStickyComment', () => {
  function gh(existing) {
    const calls = []
    const fetchImpl = vi.fn(async (url, init = {}) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(init.body) : undefined,
        headers: init.headers,
      })
      if ((init.method ?? 'GET') === 'GET')
        return { ok: true, status: 200, json: async () => existing }
      return {
        ok: true,
        status: init.method === 'POST' ? 201 : 200,
        json: async () => ({ id: 55, html_url: 'https://github.com/o/r/pull/72#issuecomment-55' }),
      }
    })
    return { fetchImpl, calls }
  }

  it('finds the comment by marker and edits it in place', async () => {
    const { fetchImpl, calls } = gh([
      { id: 1, body: 'vercel bot table' },
      { id: 2, body: `${MARKER}\nold` },
    ])
    const result = await upsertStickyComment({
      token: 't',
      repo: 'o/r',
      pr: 72,
      body: 'new',
      fetchImpl,
    })
    expect(result).toEqual({
      id: 55,
      updated: true,
      url: 'https://github.com/o/r/pull/72#issuecomment-55',
    })
    expect(calls[1]).toMatchObject({
      method: 'PATCH',
      url: 'https://api.github.com/repos/o/r/issues/comments/2',
      body: { body: 'new' },
    })
    expect(calls[0].headers.authorization).toBe('Bearer t')
  })

  it('creates one when none carries the marker', async () => {
    const { fetchImpl, calls } = gh([{ id: 1, body: 'unrelated' }])
    const result = await upsertStickyComment({
      token: 't',
      repo: 'o/r',
      pr: 72,
      body: 'new',
      fetchImpl,
    })
    expect(result.updated).toBe(false)
    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: 'https://api.github.com/repos/o/r/issues/72/comments',
    })
  })

  it('reports a read-only token (fork PR) as an error rather than looping', async () => {
    const fetchImpl = vi.fn(async (_url, init = {}) =>
      (init.method ?? 'GET') === 'GET'
        ? { ok: true, status: 200, json: async () => [] }
        : { ok: false, status: 403, json: async () => ({}) },
    )
    await expect(
      upsertStickyComment({ token: 't', repo: 'o/r', pr: 1, body: 'b', fetchImpl }),
    ).rejects.toThrow(/POST comment -> 403/)
  })

  it('findStickyComment ignores bodies that are not strings', () => {
    expect(
      findStickyComment([
        { id: 1, body: null },
        { id: 2, body: `x ${MARKER}` },
      ])?.id,
    ).toBe(2)
    expect(findStickyComment([])).toBeNull()
  })
})
