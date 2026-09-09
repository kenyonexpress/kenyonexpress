'use server'

import { nextWatchPosition, watchedEnough } from '@/lib/courses/progress'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Recording how far through a lesson somebody is.
 *
 * =========================================================================
 * THE CLIENT REPORTS A POSITION; IT DOES NOT DECIDE COMPLETION
 * =========================================================================
 *
 * A player posts seconds. Whether that means the lesson is finished is decided
 * HERE, against the lesson's own `duration_seconds`, by `watchedEnough`. The
 * alternative - a `completed: true` flag from the browser - is a certificate
 * anybody can mint with one fetch, and a certificate is the document most
 * likely to be shown to an employer.
 *
 * The RLS policy on `course_progress` is the second lock: a row may only be
 * written for `auth.uid()`. So even a caller who lies about the lesson can only
 * lie about their OWN progress.
 *
 * =========================================================================
 * THE POSITION ONLY EVER MOVES FORWARD
 * =========================================================================
 *
 * `nextWatchPosition` takes the larger of what was reported and what is stored.
 * A player that reloads reports 0 before its first `timeupdate`, and storing
 * that would restart an hour-long lesson somebody had already watched.
 *
 * `completed_at` is set once and never moved, which is why the update reads the
 * row first: re-watching a finished lesson must not re-date the certificate.
 */

export type CourseActionState = { error: string } | { success: string } | null

const schema = z.object({
  lessonId: z.string().uuid(),
  seconds: z.coerce.number().int().min(0).max(86_400),
})

async function runRecordProgress(formData: FormData): Promise<CourseActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'יש להתחבר' }

  const parsed = schema.safeParse({
    lessonId: formData.get('lessonId'),
    seconds: formData.get('seconds'),
  })
  if (!parsed.success) return { error: 'קלט לא תקין' }

  // The lesson read is what makes completion checkable. It goes through the
  // REQUEST client, so the RLS policy on `course_lessons` decides whether this
  // caller may see the lesson at all - a lesson they cannot read is a lesson
  // they cannot record progress against.
  const { data: lesson, error: lessonError } = await supabase
    .from('course_lessons' as never)
    .select('id, duration_seconds')
    .eq('id', parsed.data.lessonId)
    .maybeSingle()

  if (lessonError || !lesson) {
    // Same answer for "no such lesson" and "not yours": telling them apart
    // confirms a lesson id to somebody who has not paid.
    return { error: 'השיעור לא נמצא' }
  }
  const duration = (lesson as unknown as { duration_seconds: number | null }).duration_seconds

  // The error is NAMED and handled rather than discarded. A failed read here
  // would otherwise look like "no progress yet", and the position would be
  // written back as whatever the player last reported - which on a reload is 0,
  // erasing a watch position the customer had earned. Refusing is the cheaper
  // wrong answer.
  const { data: existing, error: existingError } = await supabase
    .from('course_progress' as never)
    .select('seconds_watched, completed_at')
    .eq('lesson_id', parsed.data.lessonId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingError) {
    log.warn('courses.progress_read_failed', { reason: existingError.message })
    return { error: 'לא ניתן לשמור את ההתקדמות' }
  }

  const stored = (existing as unknown as { seconds_watched?: number } | null)?.seconds_watched ?? 0
  const alreadyDone =
    (existing as unknown as { completed_at?: string | null } | null)?.completed_at ?? null

  const seconds = nextWatchPosition(parsed.data.seconds, stored, duration)
  // Set once. Re-watching must not re-date the certificate.
  const completedAt =
    alreadyDone ?? (watchedEnough(seconds, duration) ? new Date().toISOString() : null)

  const { error } = await supabase.from('course_progress' as never).upsert(
    {
      user_id: user.id,
      lesson_id: parsed.data.lessonId,
      seconds_watched: seconds,
      completed_at: completedAt,
    } as never,
    { onConflict: 'user_id,lesson_id' },
  )

  if (error) {
    log.warn('courses.progress_write_failed', { reason: error.message })
    return { error: 'לא ניתן לשמור את ההתקדמות' }
  }

  revalidatePath('/account/courses')
  return { success: completedAt ? 'השיעור הושלם' : 'ההתקדמות נשמרה' }
}

/**
 * Finish a lesson explicitly.
 *
 * The only way to complete a lesson with no `duration_seconds`, and the honest
 * one: nothing on the server knows how long that video is, so nothing can judge
 * whether it was watched. `watchedEnough` returns false for it deliberately
 * rather than guessing.
 */
async function runCompleteLesson(formData: FormData): Promise<CourseActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'יש להתחבר' }

  const parsed = z.object({ lessonId: z.string().uuid() }).safeParse({
    lessonId: formData.get('lessonId'),
  })
  if (!parsed.success) return { error: 'קלט לא תקין' }

  const { data: lesson, error: lessonError } = await supabase
    .from('course_lessons' as never)
    .select('id')
    .eq('id', parsed.data.lessonId)
    .maybeSingle()
  // Same answer for a failed read and a lesson that is not there: both mean
  // this caller does not get to complete it, and distinguishing them would tell
  // an unpaid caller that a lesson id is real.
  if (lessonError || !lesson) return { error: 'השיעור לא נמצא' }

  // Named for the same reason as above: a failed read read as "not completed
  // yet" would re-date a certificate that had already been earned.
  const { data: existing, error: existingError } = await supabase
    .from('course_progress' as never)
    .select('completed_at, seconds_watched')
    .eq('lesson_id', parsed.data.lessonId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingError) {
    log.warn('courses.progress_read_failed', { reason: existingError.message })
    return { error: 'לא ניתן לסמן את השיעור' }
  }

  const already = (existing as unknown as { completed_at?: string | null } | null)?.completed_at
  if (already) return { success: 'השיעור כבר הושלם' }

  const { error } = await supabase.from('course_progress' as never).upsert(
    {
      user_id: user.id,
      lesson_id: parsed.data.lessonId,
      seconds_watched:
        (existing as unknown as { seconds_watched?: number } | null)?.seconds_watched ?? 0,
      completed_at: new Date().toISOString(),
    } as never,
    { onConflict: 'user_id,lesson_id' },
  )

  if (error) {
    log.warn('courses.complete_write_failed', { reason: error.message })
    return { error: 'לא ניתן לסמן את השיעור' }
  }

  revalidatePath('/account/courses')
  return { success: 'השיעור הושלם' }
}

export async function recordLessonProgress(
  _prev: CourseActionState,
  formData: FormData,
): Promise<CourseActionState> {
  return withActionContext('courses.record_progress', () => runRecordProgress(formData))
}

export async function completeLesson(
  _prev: CourseActionState,
  formData: FormData,
): Promise<CourseActionState> {
  return withActionContext('courses.complete_lesson', () => runCompleteLesson(formData))
}
