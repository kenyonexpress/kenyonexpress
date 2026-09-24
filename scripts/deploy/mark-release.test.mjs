import { describe, expect, it, vi } from 'vitest'
import { buildMarkers, markRelease } from './mark-release.mjs'

const meta = {
  sha: 'abcdef1234567890',
  deploymentId: 'dpl_1',
  url: 'https://kenyonexpress.vercel.app',
  at: new Date('2026-09-17T12:00:00Z'),
}

describe('buildMarkers', () => {
  it('builds nothing when no surface is configured', () => {
    expect(buildMarkers({}, meta)).toEqual([])
  })

  it('builds a Sentry release and deploy when the three Sentry variables are set', () => {
    const markers = buildMarkers(
      { SENTRY_AUTH_TOKEN: 'st', SENTRY_ORG: 'ke', SENTRY_PROJECT: 'web' },
      meta,
    )
    expect(markers.map((m) => `${m.surface}/${m.step}`)).toEqual([
      'sentry/release',
      'sentry/deploy',
    ])
    expect(markers[0].url).toBe('https://sentry.io/api/0/organizations/ke/releases/')
    expect(JSON.parse(markers[0].init.body)).toEqual({ version: meta.sha, projects: ['web'] })
    expect(markers[1].url).toBe(
      `https://sentry.io/api/0/organizations/ke/releases/${meta.sha}/deploys/`,
    )
    expect(JSON.parse(markers[1].init.body)).toMatchObject({
      environment: 'production',
      name: 'dpl_1',
      url: meta.url,
    })
    expect(markers[0].okStatuses).toContain(208)
  })

  it('skips Sentry without a sha, because a release needs a version', () => {
    expect(
      buildMarkers(
        { SENTRY_AUTH_TOKEN: 'st', SENTRY_ORG: 'ke', SENTRY_PROJECT: 'web' },
        { ...meta, sha: undefined },
      ),
    ).toEqual([])
  })

  it('builds a PostHog annotation with the personal key, on the non-ingest host', () => {
    const markers = buildMarkers(
      {
        POSTHOG_API_KEY: 'phx',
        POSTHOG_PROJECT_ID: '42',
        NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
      },
      { ...meta, event: 'rolled-back' },
    )
    expect(markers).toHaveLength(1)
    expect(markers[0].url).toBe('https://eu.posthog.com/api/projects/42/annotations/')
    expect(markers[0].init.headers.authorization).toBe('Bearer phx')
    expect(JSON.parse(markers[0].init.body)).toMatchObject({
      content: 'deploy rolled-back: dpl_1 abcdef1',
      date_marker: '2026-09-17T12:00:00.000Z',
      scope: 'project',
    })
  })

  it('never uses the public NEXT_PUBLIC_POSTHOG_KEY for the annotation API', () => {
    expect(
      buildMarkers({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_public', POSTHOG_PROJECT_ID: '42' }, meta),
    ).toEqual([])
  })

  it('ingests one Axiom event into the deploy dataset, falling back to the main dataset', () => {
    const a = buildMarkers(
      { AXIOM_TOKEN: 'ax', AXIOM_DATASET: 'ke', AXIOM_DEPLOY_DATASET: 'ke-deploys' },
      meta,
    )
    expect(a[0].url).toBe('https://api.axiom.co/v1/datasets/ke-deploys/ingest')
    expect(JSON.parse(a[0].init.body)).toEqual([
      expect.objectContaining({
        kind: 'deploy',
        event: 'promoted',
        deployment_id: 'dpl_1',
        sha: meta.sha,
      }),
    ])
    const b = buildMarkers({ AXIOM_TOKEN: 'ax', AXIOM_DATASET: 'ke' }, meta)
    expect(b[0].url).toBe('https://api.axiom.co/v1/datasets/ke/ingest')
    expect(buildMarkers({ AXIOM_TOKEN: 'ax' }, meta)).toEqual([])
  })
})

describe('markRelease', () => {
  const env = {
    SENTRY_AUTH_TOKEN: 'st',
    SENTRY_ORG: 'ke',
    SENTRY_PROJECT: 'web',
    AXIOM_TOKEN: 'ax',
    AXIOM_DATASET: 'ke',
  }

  it('reports each surface separately and keeps going after a failure', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/deploys/')) throw new Error('ECONNRESET Bearer st')
      return { status: String(url).includes('axiom') ? 200 : 208 }
    })
    const outcomes = await markRelease(env, meta, fetchImpl)
    expect(outcomes).toEqual([
      { surface: 'sentry', step: 'release', ok: true, status: 208 },
      {
        surface: 'sentry',
        step: 'deploy',
        ok: false,
        status: 0,
        error: 'ECONNRESET Bearer [redacted]',
      },
      { surface: 'axiom', step: 'ingest', ok: true, status: 200 },
    ])
  })

  it('treats an unexpected status as a failure, not a throw', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 401 }))
    const outcomes = await markRelease(env, meta, fetchImpl)
    expect(outcomes.every((o) => o.ok === false)).toBe(true)
  })
})
