import { isPrerenderAbort } from '@/lib/observability/prerender-abort'
import { describe, expect, it } from 'vitest'

const NEXT_MESSAGE =
  'During prerendering, fetch() rejects when the prerender is complete. Typically these errors are handled by React but if you move fetch() to a different context by using `setTimeout`, `after`, or similar functions you may observe this error and you should handle it in that context. This occurred at route "/product/[slug]".'

describe('isPrerenderAbort', () => {
  it('recognises the thrown Next.js error by its digest', () => {
    const thrown = Object.assign(new Error('anything'), { digest: 'HANGING_PROMISE_REJECTION' })
    expect(isPrerenderAbort(thrown)).toBe(true)
  })

  it('recognises the shape supabase-js hands a call site: the message only', () => {
    // supabase-js catches the fetch throw and returns { error: { message } };
    // the digest does not survive that, so the phrase has to.
    expect(isPrerenderAbort({ message: `Error: ${NEXT_MESSAGE}` })).toBe(true)
    expect(isPrerenderAbort(new Error(NEXT_MESSAGE.replace('fetch()', '`cookies()`')))).toBe(true)
  })

  it('is false for everything a dashboard must still count', () => {
    expect(isPrerenderAbort(new Error('ECONNRESET'))).toBe(false)
    expect(isPrerenderAbort({ message: 'permission denied for table orders' })).toBe(false)
    expect(isPrerenderAbort(Object.assign(new Error('x'), { digest: 'NEXT_NOT_FOUND' }))).toBe(
      false,
    )
    expect(isPrerenderAbort(null)).toBe(false)
    expect(
      isPrerenderAbort('During prerendering, fetch() rejects when the prerender is complete'),
    ).toBe(false)
  })
})
