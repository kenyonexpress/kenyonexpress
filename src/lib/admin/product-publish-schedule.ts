import { SITE_TIME_ZONE } from '@/lib/i18n/format'

/**
 * Scheduled publish (W03): a draft that carries `publish_at` goes live on its
 * own when the moment arrives, flipped by the `price-schedule` cron job (every
 * five minutes, the same cadence flash deals already depend on).
 *
 * WHY A TIMESTAMP ON THE DRAFT AND NOT A FIFTH STATUS. Every storefront read
 * filters `status = 'active'` (ten call sites, measured); a `scheduled` status
 * would be invisible to all of them by accident rather than by design, and the
 * enum is a production type nobody wants to extend for a flag. A draft with a
 * date is still a draft everywhere until the job promotes it, and the promotion
 * is one UPDATE that the admin could have made by hand.
 *
 * The column lands with pending 249. Until it is applied the product form
 * refuses a FILLED schedule with the migration's filename and saves everything
 * else (optional-column-groups), so nothing is silently written nowhere.
 */

export const PUBLISH_AT_MIGRATION_FILE = 'migrations/pending/249_product_publish_at.sql'

export const PUBLISH_AT_COLUMNS = ['publish_at'] as const

// One template literal, never several joined with `+` (STATE, template-literal trap).
export const PUBLISH_AT_MIGRATION_NOTICE = `פרסום מתוזמן עדיין לא מופעל במסד הנתונים. יש להחיל את המיגרציה ${PUBLISH_AT_MIGRATION_FILE} ואז לשמור שוב. שאר שדות המוצר נשמרים כרגיל.`

type Row = Record<string, unknown> | null | undefined

/** `products.publish_at` as stored (ISO), absent or NULL reading as none. */
export function readPublishAt(row: Row): string | null {
  const value = row?.publish_at
  if (typeof value !== 'string' || value.length === 0) return null
  return Number.isNaN(new Date(value).getTime()) ? null : value
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/

function zoneOffsetMs(utcMs: number): number {
  // The wall clock in Israel at this instant, read back as if it were UTC;
  // the difference is the zone offset, DST included.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return asUtc - utcMs
}

/**
 * A `datetime-local` value typed in Israel time to the ISO instant it names.
 * The input has no zone, the server runs in UTC, and `new Date('2026-10-05T14:00')`
 * would read the admin's 14:00 as 14:00 UTC, publishing two or three hours late.
 */
export function jerusalemLocalToIso(value: string): string | null {
  const m = value.trim().match(LOCAL_INPUT)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
  // First guess with the offset at the wall time read as UTC, then correct
  // once with the offset at the guessed instant (DST edges).
  let utc = wall - zoneOffsetMs(wall)
  utc = wall - zoneOffsetMs(utc)
  const date = new Date(utc)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** The stored instant back to the `YYYY-MM-DDTHH:mm` the input shows, in Israel time. */
export function isoToJerusalemLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const wall = new Date(ms + zoneOffsetMs(ms))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`
}

export type PublishAtParse = { ok: true; iso: string | null } | { ok: false; error: string }

/**
 * The form's `publish_at` field. Empty is "no schedule". A value must parse and
 * must be in the future: a past moment is not a schedule, it is a publish the
 * admin should do with the status select, and letting it through would have
 * the job flip the product within five minutes with no gate having run.
 */
export function parsePublishAtInput(raw: unknown, now: Date = new Date()): PublishAtParse {
  if (raw == null || String(raw).trim() === '') return { ok: true, iso: null }
  const iso = jerusalemLocalToIso(String(raw))
  if (!iso) return { ok: false, error: 'מועד הפרסום המתוזמן אינו תקין' }
  if (new Date(iso).getTime() <= now.getTime()) {
    return {
      ok: false,
      error: 'מועד הפרסום המתוזמן חייב להיות בעתיד. לפרסום מיידי בחרו סטטוס "פעיל".',
    }
  }
  return { ok: true, iso }
}

/** The minimal client surface the job needs, so the unit test can fake it. */
export interface PublishScheduleClient {
  from(table: 'products'): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        eq(
          column: string,
          value: string,
        ): {
          is(
            column: string,
            value: null,
          ): {
            not(
              column: string,
              operator: 'is',
              value: null,
            ): {
              lte(
                column: string,
                value: string,
              ): {
                limit(n: number): PromiseLike<{
                  data: { id: string }[] | null
                  error: { code?: string; message: string } | null
                }>
              }
            }
          }
        }
      }
    }
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: string,
      ): {
        eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>
      }
    }
  }
}

export interface PublishScheduleResult {
  due: number
  published: number
  failed: number
  /** Set when the column does not exist yet; nothing was read or written. */
  skipped?: string
}

const BATCH = 100
const UNDEFINED_COLUMN = '42703'

function columnAbsent(error: { code?: string; message: string }): boolean {
  if (error.code === UNDEFINED_COLUMN) return true
  const lower = error.message.toLowerCase()
  return (
    lower.includes('publish_at') &&
    (lower.includes('does not exist') ||
      lower.includes('could not find') ||
      lower.includes('schema cache'))
  )
}

/**
 * Promote every approved draft whose `publish_at` has passed. Each row is
 * updated with `status = 'draft'` in the filter, so an admin who published or
 * archived it by hand between the read and the write wins.
 */
export async function publishScheduledProducts(
  client: PublishScheduleClient,
  now: Date = new Date(),
): Promise<PublishScheduleResult> {
  const nowIso = now.toISOString()
  const { data, error } = await client
    .from('products')
    .select('id')
    .eq('status', 'draft')
    .eq('approval_status', 'approved')
    .is('deleted_at', null)
    .not('publish_at', 'is', null)
    .lte('publish_at', nowIso)
    .limit(BATCH)

  if (error) {
    if (columnAbsent(error)) {
      return { due: 0, published: 0, failed: 0, skipped: '249 not applied' }
    }
    throw new Error(`publish schedule: ${error.message}`)
  }

  const rows = data ?? []
  let published = 0
  let failed = 0
  for (const row of rows) {
    const { error: updateError } = await client
      .from('products')
      .update({ status: 'active', published_at: nowIso, publish_at: null })
      .eq('id', row.id)
      .eq('status', 'draft')
    if (updateError) failed++
    else published++
  }
  return { due: rows.length, published, failed }
}
