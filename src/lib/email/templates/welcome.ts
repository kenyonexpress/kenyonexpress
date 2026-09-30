import { buildWelcomeEmail as buildFromPayload } from '@/lib/email/notifications'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * Welcome template, the typed entry point.
 *
 * Delegates to `buildWelcomeEmail` in `../notifications.ts`, the renderer
 * behind the `welcome` outbox kind the auth callback enqueues on every
 * sign-in under `welcome:<uid>`, so only the first one ever lands. Carries no
 * offer and no coupon, on purpose: the same sender has to deliver voucher
 * codes and refund confirmations later.
 */

export interface WelcomeInput {
  /** Profile name, when the sign-up gave one. */
  fullName?: string | null
  /** Origin with no trailing slash, e.g. https://kenyonexpress.co.il */
  siteUrl: string
}

export function buildWelcomeEmail(input: WelcomeInput): BuiltEmail {
  // The builder returns null only for a kind it cannot render; the welcome
  // mail has no refusing condition, so the null is a type artefact here.
  const built = buildFromPayload({ full_name: input.fullName ?? undefined }, input.siteUrl)
  if (!built) throw new Error('buildWelcomeEmail rendered nothing')
  return built
}
