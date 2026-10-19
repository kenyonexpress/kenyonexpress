import { describe, expect, it } from 'vitest'
import { isClientDisconnect, shouldReportToSentry } from './sentry-filter'

/**
 * The two decisions that keep the money-path channel worth reading.
 *
 * Both were learned the same afternoon: a laptop running browser tests put 42
 * `The destination stream closed early` events into the shared project in 41
 * minutes, tagged `environment: development`, while the config header claimed
 * local development makes no network call.
 */
describe('shouldReportToSentry', () => {
  it('never reports without a DSN, whatever the environment says', () => {
    expect(shouldReportToSentry({ dsn: undefined, environment: 'production' })).toBe(false)
    expect(shouldReportToSentry({ dsn: '', environment: 'production' })).toBe(false)
  })

  it('reports from a deployment', () => {
    expect(
      shouldReportToSentry({ dsn: 'https://k@o.ingest.sentry.io/1', environment: 'production' }),
    ).toBe(true)
  })

  // The measured case: DSN present, environment development, events arriving.
  it.each(['development', 'test', 'local', 'Development', 'LOCAL'])(
    'stays quiet in %s, which is somebody machine and not a deployment',
    (environment) => {
      expect(shouldReportToSentry({ dsn: 'https://k@o.ingest.sentry.io/1', environment })).toBe(
        false,
      )
    },
  )

  it('treats an unset environment as local rather than as a deployment', () => {
    expect(
      shouldReportToSentry({ dsn: 'https://k@o.ingest.sentry.io/1', environment: undefined }),
    ).toBe(false)
  })

  it('can be opted back in for debugging the reporting itself', () => {
    expect(
      shouldReportToSentry({
        dsn: 'https://k@o.ingest.sentry.io/1',
        environment: 'development',
        allowLocal: 'true',
      }),
    ).toBe(true)
  })

  // The opt-in must not become an accident: any other value is not consent.
  it('does not accept a truthy-looking opt-in that is not "true"', () => {
    for (const allowLocal of ['1', 'yes', 'TRUE', ' true']) {
      expect(
        shouldReportToSentry({
          dsn: 'https://k@o.ingest.sentry.io/1',
          environment: 'development',
          allowLocal,
        }),
      ).toBe(false)
    }
  })

  // A self-hosted production build has no VERCEL_* at all. Gating on the
  // platform instead of the environment name would have silenced it.
  it('reports from a self-hosted production build', () => {
    expect(
      shouldReportToSentry({
        dsn: 'https://k@o.ingest.sentry.io/1',
        environment: 'production',
        allowLocal: undefined,
      }),
    ).toBe(true)
  })
})

describe('isClientDisconnect', () => {
  it('recognises the message Next throws when the client goes away', () => {
    expect(isClientDisconnect('The destination stream closed early.')).toBe(true)
    expect(isClientDisconnect('The destination stream closed early')).toBe(true)
  })

  it('tolerates surrounding whitespace', () => {
    expect(isClientDisconnect('  The destination stream closed early.  ')).toBe(true)
  })

  it('is false for nothing at all', () => {
    expect(isClientDisconnect(undefined)).toBe(false)
    expect(isClientDisconnect(null)).toBe(false)
    expect(isClientDisconnect('')).toBe(false)
  })

  // Matched by exact message on purpose. A new streaming failure that merely
  // mentions a stream must still reach a human.
  it('does not swallow a different streaming error', () => {
    expect(isClientDisconnect('The destination stream closed early and the order was lost')).toBe(
      false,
    )
    expect(isClientDisconnect('stream closed')).toBe(false)
    expect(isClientDisconnect('ERR_STREAM_DESTROYED')).toBe(false)
  })
})
