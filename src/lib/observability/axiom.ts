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
 * Ships one structured event. Resolves when the attempt settles; the caller
 * is expected to `void` it. `_time` is Axiom's timestamp field.
 */
export async function shipAxiomEvent(event: Record<string, unknown>): Promise<void> {
  const config = env()
  if (!config) return
  try {
    await fetch(`${API}/${encodeURIComponent(config.dataset)}/ingest`, {
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
