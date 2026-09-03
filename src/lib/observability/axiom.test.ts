import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAxiomEnabled, shipAxiomEvent } from './axiom'

/**
 * The Axiom leg (marathon step 14). Same contract as every other outbound
 * module here: inert without credentials, one REST call with the exact shape
 * the API wants, and failure swallowed -- a logging pipeline that adds an
 * error line per log line is self-amplifying.
 */

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubEnv('AXIOM_TOKEN', 'xat_test')
  vi.stubEnv('AXIOM_DATASET', 'kenyon-logs')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('axiom shipping', () => {
  it('is inert without a token or without a dataset', async () => {
    for (const missing of ['AXIOM_TOKEN', 'AXIOM_DATASET']) {
      vi.stubEnv(missing, '')
      expect(isAxiomEnabled()).toBe(false)
      await shipAxiomEvent({ event: 'x' })
      vi.stubEnv(missing, missing === 'AXIOM_TOKEN' ? 'xat_test' : 'kenyon-logs')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the event to the dataset ingest endpoint with the bearer token', async () => {
    await shipAxiomEvent({ event: 'cron.ran', level: 'info' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.axiom.co/v1/datasets/kenyon-logs/ingest')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer xat_test')
    const body = JSON.parse(init.body as string) as Record<string, unknown>[]
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ event: 'cron.ran', level: 'info' })
    expect(body[0]?._time).toBeTypeOf('string')
  })

  it('swallows a network failure completely', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(shipAxiomEvent({ event: 'x' })).resolves.toBeUndefined()
  })

  it('swallows a non-2xx without inspecting it', async () => {
    fetchMock.mockResolvedValue(new Response('no', { status: 403 }))
    await expect(shipAxiomEvent({ event: 'x' })).resolves.toBeUndefined()
  })
})
