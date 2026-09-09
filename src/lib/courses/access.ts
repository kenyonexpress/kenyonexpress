import { log } from '@/lib/observability/log'
import { createR2SignedDownloadUrl } from '@/lib/storage/r2-service'
import { createClient } from '@/lib/supabase/server'

/**
 * The line between a paid course and anybody holding a product id.
 *
 * =========================================================================
 * THE CHECK IS IN THE DATABASE, AND THIS ASKS IT
 * =========================================================================
 *
 * `has_course_access(product_id)` is a `SECURITY DEFINER` function that reads
 * `auth.uid()` - it does NOT take a uid. That distinction is the one this
 * database has already been bitten by: a definer function that accepts a uid
 * attributes the check to whoever the caller names, which is an authorisation
 * bypass wearing a parameter.
 *
 * So this module calls it through the REQUEST-SCOPED client, the one carrying
 * the caller's JWT, and never through the service role. Using the admin client
 * here would make `auth.uid()` null and every check fail closed - which sounds
 * safe and would instead mean nobody could ever watch anything.
 *
 * =========================================================================
 * IT FAILS CLOSED, WITHOUT EXCEPTION
 * =========================================================================
 *
 * Everything else in this repository that reads a config fails open, because an
 * empty catalogue is worse than a stale one. This is the opposite case: the
 * thing being protected is a video somebody paid for, and the cost of a wrong
 * answer is asymmetric in the other direction. A reader who is refused retries;
 * a reader who is wrongly allowed has the file.
 */

/** How long a lesson URL is good for. */
const VIDEO_URL_TTL_SECONDS = 60 * 30

export type LessonVideo =
  | { ok: true; url: string; expiresInSeconds: number }
  | { ok: false; reason: 'not_signed_in' | 'no_access' | 'no_video' | 'unavailable' }

/**
 * Whether the caller may watch this course.
 *
 * A missing function - 212 unapplied - is `false`. That is deliberate and is
 * the one place where "not applied yet" is not treated as "carry on": until the
 * migration lands there are no courses, so nobody is being refused anything,
 * and a version of this that defaulted to true would be a permanently open door
 * waiting for the first course to be created.
 */
export async function hasCourseAccess(productId: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc(
      'has_course_access' as never,
      {
        p_product_id: productId,
      } as never,
    )

    if (error) {
      log.warn('courses.access_check_failed', { productId, reason: error.message })
      return false
    }
    return data === true
  } catch (error) {
    log.warn('courses.access_check_threw', { productId, err: error })
    return false
  }
}

/**
 * A short-lived URL for one lesson's video, or a reason it was refused.
 *
 * THE ORDER MATTERS. Access is checked BEFORE the lesson row is read, so a
 * caller cannot learn whether a lesson id exists by the shape of the refusal.
 * `no_access` and a lesson that is not there both look the same from outside.
 *
 * A PREVIEW LESSON SKIPS THE CHECK, and that is the only way in without paying.
 * The row's `is_preview` is what says so, and the RLS policy on `course_lessons`
 * enforces the same rule independently - so a bug here does not open a paid
 * lesson, it only fails to open a free one.
 *
 * 30 MINUTES, not the hour `createR2SignedDownloadUrl` defaults to. Long enough
 * to watch a lesson without re-signing, short enough that a URL pasted into a
 * group chat stops working before most people click it. A URL that lives an hour
 * is a lesson that can be shared for an hour.
 */
export async function lessonVideoUrl(input: {
  lessonId: string
  productId: string
  isPreview: boolean
  videoKey: string | null
}): Promise<LessonVideo> {
  if (!input.videoKey) return { ok: false, reason: 'no_video' }

  if (!input.isPreview) {
    const allowed = await hasCourseAccess(input.productId)
    if (!allowed) return { ok: false, reason: 'no_access' }
  }

  try {
    const url = await createR2SignedDownloadUrl(
      'course-videos',
      input.videoKey,
      VIDEO_URL_TTL_SECONDS,
    )
    return { ok: true, url, expiresInSeconds: VIDEO_URL_TTL_SECONDS }
  } catch (error) {
    // R2 not configured, or a key the validator refused. Not the caller's
    // fault and not something they can act on, so it is one reason rather than
    // a leak of which.
    log.error('courses.video_sign_failed', { lessonId: input.lessonId, err: error })
    return { ok: false, reason: 'unavailable' }
  }
}

export const LESSON_VIDEO_TTL_SECONDS = VIDEO_URL_TTL_SECONDS
