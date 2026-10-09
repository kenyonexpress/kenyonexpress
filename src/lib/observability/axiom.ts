/**
 * Axiom log shipping, over fetch. No SDK -- same reasoning as growth/resend
 * and whatsapp/twilio: one REST call, audited forever.
 *
 * ENTIRELY INERT without AXIOM_TOKEN + AXIOM_DATASET: isAxiomEnabled() is
 * false, shipAxiomEvent() returns without touching the network, and the
 * console transport in log.ts remains the only output. When configured, every
 * structured log line is ALSO shipped -- fire-and-forget, never awaited by
 * the caller, never throwing into it: a logging pipeline that can fail a
 * checkout is worse than no pipeline.
 *
 * WHY PER-LINE AND NOT BATCHED. The volume here is a cron route every five
 * minutes and money-path warnings, not a firehose; a batching buffer adds a
 * flush lifecycle (and a place to lose the tail of a crashing process) to
 * save requests nobody is charged meaningfully for. Revisit if volume grows.
 */

const API = 'https://api.axiom.co/v1/datasets'

type Env = { token: string; dataset: string }

function env(): Env | null {
  const token = process.env.AXIOM_TOKEN
  const dataset = process.env.AXIOM_DATASET
  if (!token || !dataset) return null
  return { token, dataset }
}

export function isAxiomEnabled(): boolean {
  return env() !== null
}

/**
 * The dataset revenue facts land in. Its own dataset so cohort queries never
 * scan the log firehose and so retention can differ (logs: 30 days; revenue:
 * as long as the plan allows). Falls back to the log dataset when unset, so
 * a half-configured environment still ships the fact somewhere queryable
 * rather than dropping it.
 */
export function revenueDataset(): string | null {
  const explicit = process.env.AXIOM_REVENUE_DATASET
  if (explicit) return explicit
  return env()?.dataset ?? null
}

export type ShipOptions = {
  /** Overrides AXIOM_DATASET for this one event. */
  dataset?: string
}

/**
 * Ships one structured event. Resolves when the attempt settles; the caller
 * is expected to `void` it. `_time` is Axiom's timestamp field.
 */
export async function shipAxiomEvent(
  event: Record<string, unknown>,
  options: ShipOptions = {},
): Promise<void> {
  const config = env()
  if (!config) return
  const dataset = options.dataset ?? config.dataset
  try {
    await fetch(`${API}/${encodeURIComponent(dataset)}/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ _time: new Date().toISOString(), ...event }]),
    })
  } catch {
    // Swallowed by design. The console line already exists; a dead Axiom must
    // not add an error line per log line, which would be self-amplifying.
  }
}
