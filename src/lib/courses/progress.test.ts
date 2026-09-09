import {
  COMPLETION_FRACTION,
  courseProgress,
  nextWatchPosition,
  watchedEnough,
} from '@/lib/courses/progress'
import { describe, expect, it } from 'vitest'

const lesson = (id: string, durationSeconds: number | null = 600) => ({
  id,
  moduleId: 'm1',
  durationSeconds,
})

describe('courseProgress', () => {
  it('counts completions and rounds the percentage', () => {
    const result = courseProgress(
      [lesson('a'), lesson('b'), lesson('c')],
      [{ lessonId: 'a', secondsWatched: 600, completedAt: '2026-09-01T00:00:00.000Z' }],
    )
    expect(result.completedLessons).toBe(1)
    expect(result.percent).toBe(33)
    expect(result.isComplete).toBe(false)
  })

  it('reports an EMPTY course as 0%, not 100%', () => {
    // `0/0` is 1 arithmetically. A course with no lessons reporting itself
    // finished would issue a certificate for attending nothing.
    const result = courseProgress([], [])
    expect(result.percent).toBe(0)
    expect(result.isComplete).toBe(false)
  })

  it('points at the first incomplete lesson, in order', () => {
    const result = courseProgress(
      [lesson('a'), lesson('b'), lesson('c')],
      [
        { lessonId: 'a', secondsWatched: 600, completedAt: '2026-09-01T00:00:00.000Z' },
        { lessonId: 'c', secondsWatched: 600, completedAt: '2026-09-02T00:00:00.000Z' },
      ],
    )
    expect(result.nextLessonId).toBe('b')
    expect(result.isComplete).toBe(false)
  })

  it('has no next lesson once everything is done, which is what offers the certificate', () => {
    const result = courseProgress(
      [lesson('a'), lesson('b')],
      [
        { lessonId: 'a', secondsWatched: 600, completedAt: '2026-09-01T00:00:00.000Z' },
        { lessonId: 'b', secondsWatched: 600, completedAt: '2026-09-05T00:00:00.000Z' },
      ],
    )
    expect(result.isComplete).toBe(true)
    expect(result.nextLessonId).toBeNull()
  })

  it('dates completion by the LAST lesson finished, not the first', () => {
    // A certificate says when the course was finished, and the course was
    // finished when its last lesson was.
    const result = courseProgress(
      [lesson('a'), lesson('b')],
      [
        { lessonId: 'a', secondsWatched: 600, completedAt: '2026-09-01T00:00:00.000Z' },
        { lessonId: 'b', secondsWatched: 600, completedAt: '2026-09-05T00:00:00.000Z' },
      ],
    )
    expect(result.completedAt).toBe('2026-09-05T00:00:00.000Z')
  })

  it('ignores progress rows for lessons that are not in the course', () => {
    const result = courseProgress(
      [lesson('a')],
      [{ lessonId: 'ghost', secondsWatched: 10, completedAt: '2026-09-01T00:00:00.000Z' }],
    )
    expect(result.completedLessons).toBe(0)
    expect(result.percent).toBe(0)
  })
})

describe('watchedEnough', () => {
  it('completes at 90%, not 100%', () => {
    // A player almost never reports the final second: `timeupdate` stops short
    // and a viewer who skips the closing card never reaches it. Requiring 100%
    // leaves a course at "one lesson to go" forever, and no certificate.
    expect(COMPLETION_FRACTION).toBe(0.9)
    expect(watchedEnough(540, 600)).toBe(true)
    expect(watchedEnough(539, 600)).toBe(false)
  })

  it('cannot be satisfied by watching when the duration is unknown', () => {
    // Nothing here knows how long it is, so the explicit button is the only
    // honest way to finish it.
    expect(watchedEnough(99999, null)).toBe(false)
    expect(watchedEnough(99999, 0)).toBe(false)
  })

  it('refuses nonsense rather than treating it as progress', () => {
    expect(watchedEnough(Number.NaN, 600)).toBe(false)
    expect(watchedEnough(-10, 600)).toBe(false)
  })
})

describe('nextWatchPosition', () => {
  it('only ever moves forward', () => {
    // A player that reloads reports 0 before the first `timeupdate`. Storing it
    // would restart an hour-long lesson the customer had already watched.
    expect(nextWatchPosition(0, 500, 600)).toBe(500)
    expect(nextWatchPosition(120, 500, 600)).toBe(500)
    expect(nextWatchPosition(550, 500, 600)).toBe(550)
  })

  it('clamps to the duration', () => {
    expect(nextWatchPosition(99999, 0, 600)).toBe(600)
  })

  it('accepts a position with no known duration', () => {
    expect(nextWatchPosition(42, 0, null)).toBe(42)
  })

  it('treats junk as zero rather than storing it', () => {
    expect(nextWatchPosition(Number.NaN, 10, 600)).toBe(10)
    expect(nextWatchPosition(-5, 10, 600)).toBe(10)
  })
})
