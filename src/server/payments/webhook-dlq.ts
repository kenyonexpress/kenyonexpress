/**
 * The Cardcom webhook dead-letter queue.
 *
 * There is no separate table. A dead letter is a row of
 * `payment_webhook_events` that got through re-verification and never reached
 * `processed_at`:
 *
 *     verified_against_api = true AND processed_at IS NULL
 *
 * That pair is only reachable one way. The route persists the event, re-checks
 * it against Cardcom's own API, writes `verified_against_api`, and only stamps
 * `processed_at` once `finalizeOrder` has actually closed the order. So a row
 * in this state means precisely: Cardcom charged the customer, we confirmed the
 * charge with Cardcom directly, and our own finalize did not complete. That is
 * the one failure in this system where the money moved and the order did not.
 *
 * It used to be unreachable. `processed_at` was stamped one statement BEFORE
 * finalize ran, so a finalize failure left a row that claimed to be handled,
 * and the only trace was an alarm. Nothing could enumerate the damage
 * afterwards, let alone replay it.
 *
 * Replay is safe to run repeatedly: `finalizeOrder` is idempotent on
 * `orders.status` and `payments.status`, and a row that succeeds on retry is
 * stamped and leaves the queue. Nothing here re-charges anything; the charge
 * already happened, which is the whole problem being cleaned up.
 *
 * WHERE THE ATTEMPT COUNTER LIVES, AND WHY IT IS NOT A COLUMN.
 * `payment_webhook_events` has nine columns and none of them counts anything;
 * adding one is a migration, and a migration in this project waits in
 * `migrations/pending/` for an operator. A backoff that cannot run until
 * somebody applies DDL is a backoff that does not exist, and this module spent
 * its whole life so far with no caller at all - inert twice over is not an
 * improvement.
 *
 * So the counter is derived from the journal that is already there. Each
 * attempt writes one `payment_events` row with
 * `event_type = 'dlq_replay_started'` and `stage = DLQ_REPLAY_STAGE`, keyed on
 * the same `external_event_id` the webhook row carries. The count of those rows
 * IS the attempt number and the newest `occurred_at` IS the last attempt.
 * Measured against production on 2026-09-10: `payment_events` carries seven
 * indexes and NOT ONE of them is unique on `external_event_id`, so writing five
 * rows under one event id is allowed. (The docblock in `payment-events.ts`
 * asserted such an index exists. It does not, and that claim is corrected
 * there.)
 *
 * The failure mode of deriving it is worth stating: if the journal write fails,
 * the attempt is not counted and the event is retried sooner than the backoff
 * intended. That is the safe direction - finalize is idempotent, so an extra
 * attempt costs one provider-free database round trip, while an over-counted
 * attempt would retire a real customer's stranded charge early.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { type PaymentEventAdmin, recordPaymentEvent } from './payment-events'

export type DeadLetter = {
  id: string
  externalEventId: string
  paymentId: string | null
  createdAt: string
  /** Replays already started for this event. 0 until one has run. */
  attempts: number
  /** When the newest attempt started, or null if none has. */
  lastAttemptAt: string | null
}

/**
 * What a sweep did with one event.
 *
 *   replayed   - finalize closed the order; the row left the queue.
 *   failed     - finalize ran and did not close it; it stays for the next run.
 *   waiting    - inside its backoff window; not touched, not an attempt.
 *   exhausted  - five attempts spent; only a human may press it again.
 *   unlinkable - no `payment_id`, so there is nothing to finalize.
 */
export type DeadLetterStatus = 'replayed' | 'failed' | 'waiting' | 'exhausted' | 'unlinkable'

export type DeadLetterReplay = {
  event: DeadLetter
  ok: boolean
  status: DeadLetterStatus
  error?: string
}

/** How many events a single sweep will look at. */
export const DLQ_BATCH_LIMIT = 50

/**
 * Five attempts, and the wait before each one.
 *
 * The first is immediate: an event only reaches this queue because a finalize
 * already failed once inside the webhook, and the commonest cause is a database
 * hiccup that is over by the time the next sweep runs. Making the customer wait
 * five minutes for the cheap retry helps nobody.
 *
 * After that the gaps widen because the remaining causes do not clear on their
 * own - a malformed row, an order in a state finalize refuses, a supplier
 * record that was deleted. Hammering those every ten minutes for four hours
 * would write hundreds of journal rows describing one unchanging problem and
 * bury the events that are actually recoverable.
 *
 * The last window is four hours, so five attempts span about five hours: long
 * enough to cover a provider or database incident end to end, short enough that
 * the alert below fires the same working day.
 */
export const DLQ_BACKOFF_MINUTES = [0, 5, 15, 60, 240] as const

/** Attempts after which only a human may press replay. */
export const MAX_DLQ_ATTEMPTS = DLQ_BACKOFF_MINUTES.length

/**
 * Above this depth the queue stops being a blip and becomes an incident.
 *
 * Five is not a round number chosen for looks. One stranded charge is a bad
 * afternoon for one customer and the sweep usually fixes it unaided; six at
 * once has never been a coincidence in this system, it is finalize failing
 * structurally, and every minute it runs adds another charged customer with no
 * order.
 */
export const DLQ_ALERT_DEPTH = 5

/** The `stage` every journal row this module writes is tagged with. */
export const DLQ_REPLAY_STAGE = 'cardcom_dlq_replay'

type MinimalClient = Pick<SupabaseClient, 'from'>

/**
 * The attempt history, as a port.
 *
 * Injectable rather than hard-wired because the sweep and the admin button both
 * need it against a real database and every test needs it against neither, and
 * because it reads a table the DLQ query does not: a single `from()` stub that
 * had to serve both would stop describing either.
 */
export type AttemptState = { attempts: number; lastAttemptAt: string | null }

export type AttemptLedger = {
  /**
   * History for a batch, in one round trip, keyed by PAYMENT id.
   *
   * Keyed on the payment rather than on the provider's event id because the
   * payment is the thing being finalized, and it is the key the admin screen
   * already holds. An event with no payment id has no history to look up and
   * never reaches a replay at all - it is classified `unreplayable` first.
   */
  read: (paymentIds: string[]) => Promise<Map<string, AttemptState>>
  /** Records that an attempt is starting. Best effort; see the header. */
  record: (letter: DeadLetter) => Promise<void>
}

/** An empty history. Used when the journal cannot be read; see `read` below. */
const NO_HISTORY: AttemptState = { attempts: 0, lastAttemptAt: null }

/**
 * The real ledger, over `payment_events`.
 *
 * A read failure returns an EMPTY map rather than throwing, and that choice has
 * a direction: with no history every event looks like attempt one and is
 * replayed now. Finalize is idempotent, so the cost is a redundant attempt; the
 * alternative - refusing to sweep because the journal is unreadable - would
 * strand charged customers on an observability failure.
 */
export function paymentEventsLedger(admin: MinimalClient): AttemptLedger {
  return {
    async read(paymentIds: string[]): Promise<Map<string, AttemptState>> {
      const history = new Map<string, AttemptState>()
      if (paymentIds.length === 0) return history

      const { data, error } = await admin
        .from('payment_events')
        .select('payment_id, occurred_at')
        .eq('event_type', 'dlq_replay_started')
        .eq('stage', DLQ_REPLAY_STAGE)
        .in('payment_id', paymentIds)

      if (error || !data) return history

      for (const raw of data as unknown as Array<Record<string, unknown>>) {
        const key = raw.payment_id == null ? null : String(raw.payment_id)
        if (!key) continue
        const occurredAt = raw.occurred_at == null ? null : String(raw.occurred_at)
        const seen = history.get(key) ?? NO_HISTORY
        history.set(key, {
          attempts: seen.attempts + 1,
          lastAttemptAt:
            seen.lastAttemptAt && occurredAt && seen.lastAttemptAt > occurredAt
              ? seen.lastAttemptAt
              : (occurredAt ?? seen.lastAttemptAt),
        })
      }

      return history
    },

    async record(letter: DeadLetter): Promise<void> {
      await recordPaymentEvent(
        {
          eventType: 'dlq_replay_started',
          stage: DLQ_REPLAY_STAGE,
          paymentId: letter.paymentId,
          externalEventId: letter.externalEventId,
          detail: {
            webhook_event_id: letter.id,
            attempt: letter.attempts + 1,
            queued_at: letter.createdAt,
          },
        },
        admin as unknown as PaymentEventAdmin,
      )
    },
  }
}

/**
 * When this event may be replayed again.
 *
 * Measured from the last attempt, not from `created_at`. Measuring from when
 * the event was queued would make every window after the first elapse
 * instantly on an old event: a letter that has sat for a day is already past
 * `created_at + 240m`, so all five attempts would burn in five consecutive
 * sweeps and the backoff would be decorative.
 */
export function nextAttemptAt(letter: DeadLetter): Date {
  if (letter.attempts <= 0) return new Date(letter.createdAt)

  const index = Math.min(letter.attempts, DLQ_BACKOFF_MINUTES.length - 1)
  const waitMs = (DLQ_BACKOFF_MINUTES[index] ?? 0) * 60_000
  const since = letter.lastAttemptAt ?? letter.createdAt
  return new Date(new Date(since).getTime() + waitMs)
}

/** True once five attempts have been spent. */
export function isExhausted(letter: DeadLetter): boolean {
  return letter.attempts >= MAX_DLQ_ATTEMPTS
}

/**
 * Events that were charged and verified but never closed, oldest first.
 *
 * Oldest first because these are real customers holding a charge against an
 * open order: the one who has been waiting longest is the one to fix first.
 *
 * The attempt history is filled in from the ledger when one is supplied. With
 * no ledger every letter reads as attempt zero, which is what the admin screen
 * wants when it is only listing them.
 */
export async function listDeadLetters(
  admin: MinimalClient,
  limit: number = DLQ_BATCH_LIMIT,
  ledger?: AttemptLedger,
): Promise<DeadLetter[]> {
  const { data, error } = await admin
    .from('payment_webhook_events')
    .select('id, external_event_id, payment_id, created_at')
    .eq('provider', 'cardcom')
    .eq('verified_against_api', true)
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error || !data) return []

  const letters = (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    externalEventId: String(row.external_event_id),
    paymentId: row.payment_id == null ? null : String(row.payment_id),
    createdAt: String(row.created_at),
    attempts: 0,
    lastAttemptAt: null as string | null,
  }))

  if (!ledger || letters.length === 0) return letters

  const history = await ledger.read(
    letters.map((letter) => letter.paymentId).filter((id): id is string => id != null),
  )
  return letters.map((letter) => {
    const seen = letter.paymentId ? history.get(letter.paymentId) : undefined
    return seen ? { ...letter, ...seen } : letter
  })
}

/**
 * Counts the whole queue, past the batch limit.
 *
 * The sweep is bounded at fifty and the alert is about depth, so the two must
 * not be the same number: a backlog of four hundred read through a fifty-row
 * page would report a depth of fifty and look like a plateau on the day it is
 * an outage.
 */
export async function countDeadLetters(admin: MinimalClient): Promise<number> {
  const { count, error } = await admin
    .from('payment_webhook_events')
    .select('id', { count: 'exact', head: true })
    .eq('provider', 'cardcom')
    .eq('verified_against_api', true)
    .is('processed_at', null)

  if (error) return 0
  return count ?? 0
}

/**
 * Marks one event done. Called only after a finalize actually succeeded.
 *
 * Scoped by id rather than by (provider, external_event_id) so a replay cannot
 * stamp a different row that happens to share an event id, which is possible
 * while the unique index is being rebuilt.
 */
export async function markProcessed(
  admin: MinimalClient,
  eventId: string,
  now: Date = new Date(),
): Promise<void> {
  await admin
    .from('payment_webhook_events')
    .update({ processed_at: now.toISOString() })
    .eq('id', eventId)
}

export type FinalizeForReplay = (paymentId: string) => Promise<{ ok: boolean; error?: string }>

export type ReplayOptions = {
  limit?: number
  ledger?: AttemptLedger
  now?: Date
  /**
   * Ignore both the backoff and the five-attempt ceiling.
   *
   * The admin button sets this and the cron sweep never does. An operator
   * pressing replay has looked at the row and decided; making them wait out a
   * four-hour window they can see on screen would be the software arguing with
   * the person holding the customer on the phone.
   */
  force?: boolean
}

/**
 * Replays the queue once.
 *
 * A dead letter with no `payment_id` cannot be replayed: we never established
 * which payment it belonged to, so there is nothing to finalize. It is
 * reported rather than silently skipped, because it needs a human, and
 * `processed_at` stays null so it keeps showing up until one looks.
 */
export async function replayDeadLetters(
  admin: MinimalClient,
  finalize: FinalizeForReplay,
  options: ReplayOptions = {},
): Promise<DeadLetterReplay[]> {
  const limit = options.limit ?? DLQ_BATCH_LIMIT
  const now = options.now ?? new Date()
  const force = options.force ?? false

  const events = await listDeadLetters(admin, limit, options.ledger)
  const results: DeadLetterReplay[] = []

  for (const event of events) {
    if (!event.paymentId) {
      results.push({
        event,
        ok: false,
        status: 'unlinkable',
        error: 'event has no payment_id; cannot replay',
      })
      continue
    }

    if (!force && isExhausted(event)) {
      results.push({
        event,
        ok: false,
        status: 'exhausted',
        error: `gave up after ${MAX_DLQ_ATTEMPTS} attempts`,
      })
      continue
    }

    if (!force && nextAttemptAt(event).getTime() > now.getTime()) {
      results.push({ event, ok: false, status: 'waiting' })
      continue
    }

    // Recorded BEFORE the attempt, not after. A finalize that hangs until the
    // function times out writes nothing on the way out, so counting on the way
    // back would leave that event on attempt zero forever, retried by every
    // sweep, which is the one shape of this bug that never self-corrects.
    await options.ledger?.record(event)

    let outcome: { ok: boolean; error?: string }
    try {
      outcome = await finalize(event.paymentId)
    } catch (cause) {
      // A throwing finalize must not take the sweep down with it: the
      // remaining events are other people's money.
      outcome = { ok: false, error: cause instanceof Error ? cause.message : 'finalize threw' }
    }

    if (outcome.ok) await markProcessed(admin, event.id, now)
    results.push({
      event,
      ok: outcome.ok,
      status: outcome.ok ? 'replayed' : 'failed',
      ...(outcome.error ? { error: outcome.error } : {}),
    })
  }

  return results
}

/** What one sweep did, counted the way an operator reads it. */
export type DeadLetterSweep = {
  results: DeadLetterReplay[]
  /** The whole queue, not the page. See `countDeadLetters`. */
  depth: number
  /** Events an attempt was actually spent on this run. */
  replayed: number
  /** Of those, the ones whose order closed. */
  succeeded: number
  /** Of those, the ones that did not. They come back after the next window. */
  failed: number
  /** Past five attempts. Nothing automatic will touch these again. */
  stuck: number
  /** Inside a backoff window. Not an attempt, not a problem. */
  waiting: number
  /** No `payment_id` at all, so there is nothing to finalize. */
  unreplayable: number
}

/**
 * One sweep, with the ledger wired and the counts a caller reports.
 *
 * The default ledger is the real one, so a caller that forgets to pass a ledger
 * gets backoff rather than silently getting none. `replayDeadLetters` keeps the
 * ledger optional because its tests supply their own; this is the entry point
 * production uses, and production must not be the configuration nobody chose.
 */
export async function sweepDeadLetters(
  admin: MinimalClient,
  finalize: FinalizeForReplay,
  options: ReplayOptions = {},
): Promise<DeadLetterSweep> {
  const ledger = options.ledger ?? paymentEventsLedger(admin)
  const results = await replayDeadLetters(admin, finalize, { ...options, ledger })

  // Counted AFTER the sweep, on purpose: the rows this run just closed are gone
  // by now, so the number reported is the backlog that remains rather than the
  // one that was found, and an alert fires on what is still wrong.
  const depth = await countDeadLetters(admin)

  const count = (status: DeadLetterStatus) => results.filter((r) => r.status === status).length
  const succeeded = count('replayed')
  const failed = count('failed')

  return {
    results,
    depth,
    replayed: succeeded + failed,
    succeeded,
    failed,
    stuck: count('exhausted'),
    waiting: count('waiting'),
    unreplayable: count('unlinkable'),
  }
}

/**
 * One dead letter, replayed because a person asked.
 *
 * IT IGNORES THE BACKOFF AND THE CEILING, which is the entire reason it exists
 * separately from the sweep. An operator pressing this has the customer on the
 * phone and can see on the same screen that the row has spent five attempts;
 * software that answered "come back in four hours" would be arguing with the
 * only party who can actually decide.
 *
 * IT STILL RE-READS THE ROW rather than trusting the id from the form. A
 * `processed_at` that was stamped between the page render and the click means
 * the order is already closed - by the sweep, or by a second operator - and
 * finalizing again on that basis would be this system's one unrecoverable
 * mistake dressed up as a retry. Finalize is idempotent, so the real cost is
 * small; refusing is still right, because "already handled" and "handled twice"
 * must not read the same in the audit log.
 *
 * The actor is written onto the journal row, so the attempt that a human caused
 * is distinguishable from the four the scheduler spent.
 */
export async function forceReplayDeadLetter(
  admin: MinimalClient,
  eventId: string,
  finalize: FinalizeForReplay,
  actor?: { id: string | null; role: string | null },
  now: Date = new Date(),
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await admin
    .from('payment_webhook_events')
    .select('id, external_event_id, payment_id, created_at, processed_at, verified_against_api')
    .eq('id', eventId)
    .maybeSingle()

  if (error) return { ok: false, error: `לא ניתן לקרוא את השורה: ${error.message}` }
  const row = data as Record<string, unknown> | null
  if (!row) return { ok: false, error: 'השורה לא נמצאה' }
  if (row.processed_at != null) return { ok: false, error: 'השורה כבר טופלה' }
  if (row.verified_against_api !== true) {
    // Not a dead letter. Nothing confirmed with Cardcom that this charge
    // happened, so closing the order would be inventing a payment.
    return { ok: false, error: 'התשלום לא אומת מול קארדקום, אין מה לשחזר' }
  }

  const paymentId = row.payment_id == null ? null : String(row.payment_id)
  if (!paymentId) return { ok: false, error: 'אין תשלום מקושר, נדרשת בדיקה ידנית' }

  const history = await paymentEventsLedger(admin).read([paymentId])
  const seen = history.get(paymentId) ?? NO_HISTORY

  const letter: DeadLetter = {
    id: String(row.id),
    externalEventId: String(row.external_event_id),
    paymentId,
    createdAt: String(row.created_at),
    attempts: seen.attempts,
    lastAttemptAt: seen.lastAttemptAt,
  }

  await recordPaymentEvent(
    {
      eventType: 'dlq_replay_started',
      stage: DLQ_REPLAY_STAGE,
      paymentId: letter.paymentId,
      externalEventId: letter.externalEventId,
      detail: { webhook_event_id: letter.id, attempt: letter.attempts + 1, manual: true },
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? null,
    },
    admin as unknown as PaymentEventAdmin,
  )

  let outcome: { ok: boolean; error?: string }
  try {
    outcome = await finalize(paymentId)
  } catch (cause) {
    outcome = { ok: false, error: cause instanceof Error ? cause.message : 'finalize threw' }
  }

  if (outcome.ok) await markProcessed(admin, letter.id, now)
  return outcome
}

/**
 * The ceiling, under the name the admin screen says out loud.
 *
 * The page tells an operator "every queue gives up after N attempts", and the
 * other three queues on that page really do stop at five. Exporting the number
 * rather than printing a literal is what keeps that sentence true if this
 * module ever changes its mind.
 */
export const MAX_REPLAY_ATTEMPTS = MAX_DLQ_ATTEMPTS

/**
 * Attempt history for a set of payments, for a caller that already has the
 * letters and only wants the counts.
 *
 * The admin page reads this instead of passing a ledger into `listDeadLetters`
 * because it renders four queues and wants one round trip per queue, not one
 * per row.
 */
export function loadReplayState(
  admin: MinimalClient,
  paymentIds: string[],
): Promise<Map<string, AttemptState>> {
  return paymentEventsLedger(admin).read(paymentIds)
}

/**
 * Where one dead letter stands, for a screen rather than for a sweep.
 *
 *   unreplayable - no payment id; no amount of retrying can help it.
 *   stuck        - five attempts spent; only the button moves it now.
 *   due          - the next sweep will pick it up.
 *   waiting      - inside a backoff window.
 *
 * Same predicates the sweep applies, in the same order, deliberately: a screen
 * that said "due" about a row the sweep classifies as exhausted would be the
 * kind of disagreement an operator only discovers by waiting for a run that
 * never comes.
 */
export type DeadLetterVerdict = 'unreplayable' | 'stuck' | 'due' | 'waiting'

export function classifyDeadLetter(
  letter: DeadLetter,
  state: AttemptState,
  now: Date = new Date(),
): DeadLetterVerdict {
  if (!letter.paymentId) return 'unreplayable'

  const withHistory: DeadLetter = { ...letter, ...state }
  if (isExhausted(withHistory)) return 'stuck'
  return nextAttemptAt(withHistory).getTime() > now.getTime() ? 'waiting' : 'due'
}
