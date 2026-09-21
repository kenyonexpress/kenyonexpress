import { log } from './log'

/**
 * One line per queue per sweep, whatever the number is.
 *
 * MEASURED 2026-09-21. Three queues on this system count themselves on a
 * schedule and then throw the number away unless it is already bad:
 *
 *   - `/api/cron/health` reads `searchOutbox.pending` every five minutes and
 *     logs `search.outbox_backlog` only above 500.
 *   - `/api/cron/webhook-dlq` computes `sweep.depth` every run and logs
 *     `webhook_dlq.stuck` only when something is stuck.
 *   - `notification_outbox` was not counted at all; the drain reads the rows
 *     that are due, which is a different number.
 *
 * A threshold line says a queue broke. It cannot say a queue was climbing, and
 * climbing is the whole value of the measurement -- by the time the warn fires
 * the backlog is the incident rather than its forecast. The counting already
 * happened and cost a query; the only thing missing was saying the number out
 * loud, so that is what this does.
 *
 * `info`, not `debug`: `log.ts` defaults the threshold to `info` and no
 * environment sets `LOG_LEVEL`, so `debug` would be the same as not logging.
 * The volume is bounded by the schedules above -- three lines every five
 * minutes at the very most, not one per request.
 *
 * The threshold warns stay where they are. This is the series; those are the
 * interrupt, and they answer different questions.
 */
export type QueueName = 'search_outbox' | 'notification_outbox' | 'payment_webhook_dlq'

export function recordQueueDepth(
  queue: QueueName,
  depth: { pending: number | null; stuck?: number },
): void {
  // `null` is "the sweep did not get far enough to count", which is not zero.
  // Charting it as zero would draw a drained queue at exactly the moment the
  // thing that drains it is failing.
  if (depth.pending == null) return

  log.info('queue.depth', {
    queue,
    pending: depth.pending,
    ...(depth.stuck === undefined ? {} : { stuck: depth.stuck }),
  })
}
