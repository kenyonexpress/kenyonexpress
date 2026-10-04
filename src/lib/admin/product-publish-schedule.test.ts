import { describe, expect, it } from 'vitest'
import {
  PUBLISH_AT_MIGRATION_FILE,
  PUBLISH_AT_MIGRATION_NOTICE,
  type PublishScheduleClient,
  isoToJerusalemLocal,
  jerusalemLocalToIso,
  parsePublishAtInput,
  publishScheduledProducts,
  readPublishAt,
} from './product-publish-schedule'

describe('jerusalemLocalToIso', () => {
  it('reads the input as Israel time, summer and winter', () => {
    // IDT (UTC+3) in July, IST (UTC+2) in January.
    expect(jerusalemLocalToIso('2026-07-15T14:00')).toBe('2026-07-15T11:00:00.000Z')
    expect(jerusalemLocalToIso('2026-01-15T14:00')).toBe('2026-01-15T12:00:00.000Z')
  })

  it('round-trips through the input format', () => {
    expect(isoToJerusalemLocal('2026-07-15T11:00:00.000Z')).toBe('2026-07-15T14:00')
    expect(isoToJerusalemLocal('2026-01-15T12:00:00.000Z')).toBe('2026-01-15T14:00')
    expect(isoToJerusalemLocal(null)).toBe('')
    expect(isoToJerusalemLocal('garbage')).toBe('')
  })

  it('refuses anything that is not YYYY-MM-DDTHH:mm', () => {
    expect(jerusalemLocalToIso('15/07/2026 14:00')).toBeNull()
    expect(jerusalemLocalToIso('')).toBeNull()
  })
})

describe('parsePublishAtInput', () => {
  const now = new Date('2026-10-05T10:00:00.000Z')

  it('treats empty as no schedule', () => {
    expect(parsePublishAtInput('', now)).toEqual({ ok: true, iso: null })
    expect(parsePublishAtInput(null, now)).toEqual({ ok: true, iso: null })
  })

  it('accepts a future moment and refuses a past one', () => {
    expect(parsePublishAtInput('2026-10-06T09:00', now)).toEqual({
      ok: true,
      iso: '2026-10-06T06:00:00.000Z',
    })
    const past = parsePublishAtInput('2026-10-05T12:00', now) // 09:00Z, before now
    expect(past.ok).toBe(false)
    if (!past.ok) expect(past.error).toContain('בעתיד')
  })

  it('refuses garbage with a Hebrew message', () => {
    const r = parsePublishAtInput('tomorrow', now)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('אינו תקין')
  })
})

describe('readPublishAt', () => {
  it('reads an ISO string and nothing else', () => {
    expect(readPublishAt({ publish_at: '2026-10-06T06:00:00+00:00' })).toBe(
      '2026-10-06T06:00:00+00:00',
    )
    expect(readPublishAt({ publish_at: null })).toBeNull()
    expect(readPublishAt({})).toBeNull()
    expect(readPublishAt({ publish_at: 'nope' })).toBeNull()
  })
})

describe('the migration notice', () => {
  it('names the file so the admin knows what to apply', () => {
    expect(PUBLISH_AT_MIGRATION_NOTICE).toContain(PUBLISH_AT_MIGRATION_FILE)
    expect(PUBLISH_AT_MIGRATION_FILE).toMatch(/^migrations\/pending\/249_/)
  })
})

function fakeClient(
  selectResult: { data: { id: string }[] | null; error: { code?: string; message: string } | null },
  updateErrors: Record<string, string> = {},
) {
  const updates: { id: string; values: Record<string, unknown> }[] = []
  const client: PublishScheduleClient = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    is() {
                      return {
                        not() {
                          return {
                            lte() {
                              return { limit: async () => selectResult }
                            },
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        },
        update(values: Record<string, unknown>) {
          return {
            eq(_c: string, id: string) {
              return {
                eq: async () => {
                  updates.push({ id, values })
                  return { error: updateErrors[id] ? { message: updateErrors[id] } : null }
                },
              }
            },
          }
        },
      }
    },
  }
  return { client, updates }
}

describe('publishScheduledProducts', () => {
  const now = new Date('2026-10-05T10:00:00.000Z')

  it('promotes every due draft to active, clears the schedule and stamps published_at', async () => {
    const { client, updates } = fakeClient({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    const result = await publishScheduledProducts(client, now)
    expect(result).toEqual({ due: 2, published: 2, failed: 0 })
    expect(updates).toEqual([
      {
        id: 'a',
        values: { status: 'active', published_at: now.toISOString(), publish_at: null },
      },
      {
        id: 'b',
        values: { status: 'active', published_at: now.toISOString(), publish_at: null },
      },
    ])
  })

  it('counts a failed row without stopping the batch', async () => {
    const { client } = fakeClient({ data: [{ id: 'a' }, { id: 'b' }], error: null }, { a: 'boom' })
    expect(await publishScheduledProducts(client, now)).toEqual({ due: 2, published: 1, failed: 1 })
  })

  it('skips quietly while 249 is not applied', async () => {
    const { client, updates } = fakeClient({
      data: null,
      error: { code: '42703', message: 'column products.publish_at does not exist' },
    })
    expect(await publishScheduledProducts(client, now)).toEqual({
      due: 0,
      published: 0,
      failed: 0,
      skipped: '249 not applied',
    })
    expect(updates).toEqual([])
  })

  it('throws on any other read error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'connection reset' } })
    await expect(publishScheduledProducts(client, now)).rejects.toThrow('connection reset')
  })
})
