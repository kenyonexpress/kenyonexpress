import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { suggestedPriority } from '@/server/domain/support/sla'

/**
 * The contact form's ticket, written from the contact action.
 *
 * NOT IN `server/actions/support.ts`, AND THE REASON IS A SECURITY ONE. Every
 * export of a `'use server'` file is a callable endpoint. This function takes
 * `userId` as an argument, so exporting it from there would publish an endpoint
 * that opens a ticket attributed to any account id the caller names, with any
 * email and any body - a stranger's support history, forged, from a fetch. It
 * lives here, where it is an ordinary import that only server code can reach.
 *
 * THE TICKET IS THE RECORD, NOT THE DELIVERY. The contact form's job is the
 * mail, and it already worked; this adds the row so a customer's message has a
 * status, an owner and a record that somebody answered it. That is why nothing
 * here is fatal to the form: a message that reached the inbox must not be
 * reported as failed because a column is missing.
 *
 * `channel = 'contact_form'` was ALREADY PERMITTED by the CHECK constraint in
 * production and had never been written by anything. The schema anticipated
 * this feature; the code is what was missing.
 */

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])

export async function openContactTicket(args: {
  email: string
  name: string
  body: string
}): Promise<{ ok: boolean; ticketId?: string }> {
  try {
    return await writeContactTicket(args)
  } catch (error) {
    /**
     * THE TRY IS WHAT MAKES "NEVER FATAL" TRUE RATHER THAN ASPIRATIONAL.
     *
     * `createAdminClient()` THROWS when no service key is configured - it does
     * not resolve an error, it throws - so without this, an environment with no
     * key turns the contact form into a 500 for every visitor. The mail has
     * already been sent by the time this runs; a customer who has reached us
     * must never be told the send failed because a table or a key is missing.
     */
    log.warn('support.contact_ticket_threw', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return { ok: false }
  }
}

async function writeContactTicket(args: {
  email: string
  name: string
  body: string
}): Promise<{ ok: boolean; ticketId?: string }> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  /**
   * Linked to an account ONLY when the sender is signed in.
   *
   * Not looked up by the typed address, and that restraint is the security
   * property: `support_tickets_own_read` lets the owner read the ticket, so
   * resolving `user_id` from a form field would let anybody attach a ticket to
   * a stranger's account - and then read it by signing in as nobody at all is
   * not needed, because the ticket would simply appear in the victim's list
   * carrying whatever text was submitted.
   */
  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  const userId = user?.id ?? null

  const { data: created, error } = await admin
    .from('support_tickets')
    .insert({
      user_id: userId,
      // The column 203 adds, and the reason it had to: a contact-form ticket
      // has no account and no phone, so without this the table could hold a
      // message from somebody we have no way of answering.
      email: args.email,
      channel: 'contact_form',
      category: 'other',
      priority: suggestedPriority({ channel: 'contact_form', category: 'other' }),
      subject: `פנייה מ${args.name}`.slice(0, 80),
      last_customer_message_at: now,
    } as never)
    .select('id')
    .single()

  if (error || !created) {
    // 42P01 and 42703 are the expected state until 203 is applied. Quiet,
    // because the mail went out and there is nothing for anyone to do.
    if (!MISSING.has(error?.code ?? '')) {
      log.warn('support.contact_ticket_failed', { reason: error?.message })
    }
    return { ok: false }
  }

  const ticketId = (created as { id: string }).id
  const { error: messageError } = await admin.from('support_ticket_messages').insert({
    ticket_id: ticketId,
    direction: 'inbound',
    body: args.body,
    author_id: userId,
  } as never)
  if (messageError) {
    // The ticket exists and the mail was sent, so the operator has the message
    // twice over. Logged so a table that rejects every message is visible.
    log.warn('support.contact_message_failed', { ticketId, reason: messageError.message })
  }

  return { ok: true, ticketId }
}
