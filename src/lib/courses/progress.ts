/**
 * How far through a course somebody is, as arithmetic.
 *
 * Pure and clock-free, for the reason `lib/commerce/recurring.ts` gives about
 * the charge outcome: the decisions worth getting right are testable without a
 * database, and the certificate depends on one of them being exactly right.
 */

export interface LessonRef {
  id: string
  moduleId: string
  /** Seconds, when known. A lesson with no video has none. */
  durationSeconds: number | null
}

export interface ProgressRow {
  lessonId: string
  secondsWatched: number
  completedAt: string | null
}

export interface CourseProgress {
  totalLessons: number
  completedLessons: number
  /** 0 to 100, integer. 100 only when every lesson is complete. */
  percent: number
  /** True when the whole course is done. What the certificate hangs on. */
  isComplete: boolean
  /**
   * The lesson to open on "continue": the first incomplete one in order.
   * Null when the course is finished, which is what tells the UI to offer the
   * certificate instead of a player.
   */
  nextLessonId: string | null
  /** The last completion, which is the date a certificate carries. */
  completedAt: string | null
}

/**
 * `lessons` must already be in the order the course is taken in. Sorting here
 * would need the module positions as well as the lesson positions, and the
 * caller has both; passing a flattened ordered list keeps this from needing to
 * know the shape of the syllabus.
 */
export function courseProgress(
  lessons: readonly LessonRef[],
  rows: readonly ProgressRow[],
): CourseProgress {
  const byLesson = new Map(rows.map((row) => [row.lessonId, row]))

  const completed = lessons.filter((lesson) => byLesson.get(lesson.id)?.completedAt != null)

  // AN EMPTY COURSE IS 0%, NOT 100%. `0/0` is one, arithmetically, and a course
  // with no lessons would otherwise report itself finished and issue a
  // certificate for attending nothing.
  const percent = lessons.length === 0 ? 0 : Math.round((completed.length / lessons.length) * 100)

  const next = lessons.find((lesson) => byLesson.get(lesson.id)?.completedAt == null)

  // The LATEST completion, not the first: a certificate says when the course was
  // finished, and the course was finished when its last lesson was.
  const completedAt = completed
    .map((lesson) => byLesson.get(lesson.id)?.completedAt)
    .filter((value): value is string => typeof value === 'string')
    .sort()
    .at(-1)

  return {
    totalLessons: lessons.length,
    completedLessons: completed.length,
    percent,
    isComplete: lessons.length > 0 && completed.length === lessons.length,
    nextLessonId: next?.id ?? null,
    completedAt: completedAt ?? null,
  }
}

/**
 * Whether a watch position counts as having finished the lesson.
 *
 * NINETY PER CENT, NOT A HUNDRED. A video player almost never reports the final
 * second: it fires `ended` after the last frame, `timeupdate` stops short, and
 * a viewer who skips the closing card never reaches it at all. Requiring 100%
 * would leave a course permanently at "one lesson to go" for a customer who has
 * watched everything, and no certificate.
 *
 * A lesson with an unknown duration cannot be completed by watching. It is
 * completed by the explicit button, which is the honest answer: nothing here
 * knows how long it is.
 */
export const COMPLETION_FRACTION = 0.9

export function watchedEnough(
  secondsWatched: number,
  durationSeconds: number | null | undefined,
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!Number.isFinite(secondsWatched) || secondsWatched < 0) return false
  return secondsWatched >= durationSeconds * COMPLETION_FRACTION
}

/**
 * The seconds to store, given what the player reported and what is on record.
 *
 * IT ONLY EVER GOES FORWARD. A player that seeks backwards, or reloads and
 * reports 0 before the first `timeupdate`, would otherwise erase a position the
 * customer had earned - and on a resume that means starting an hour-long lesson
 * again. Clamped to the duration so a buggy player cannot store an hour of
 * watching for a five-minute video.
 */
export function nextWatchPosition(
  reported: number,
  stored: number,
  durationSeconds: number | null | undefined,
): number {
  const safe = Number.isFinite(reported) && reported > 0 ? Math.floor(reported) : 0
  const forward = Math.max(safe, Math.max(0, Math.floor(stored)))
  if (durationSeconds && durationSeconds > 0) return Math.min(forward, durationSeconds)
  return forward
}
