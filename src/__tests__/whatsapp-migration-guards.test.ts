import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE TWO THINGS 173 SHIPPED WITHOUT, BOTH OF WHICH IT CLAIMED TO HAVE.
 *
 * Migration 173's header says the flow is "same shape as 095's email outbox"
 * and that "no client role can write any of this". Measured against production
 * before it was applied, neither sentence was true of the file, and both
 * failures are the kind that stay quiet until they are expensive.
 *
 * 1. THE ORDER TRIGGER HAD NO EXCEPTION GUARD. `tg_orders_whatsapp_status`
 *    fires on four transitions and one of them is `paid`, which finalize sets
 *    AFTER Cardcom has charged the card. An AFTER trigger that raises takes
 *    the UPDATE down with it. Proven on production in a rolled-back
 *    transaction, with the enqueue forced to fail, on two orders that both
 *    started `paid`:
 *
 *      with the guard (as applied)      UPDATE SUCCEEDED, order -> fulfilled
 *      without it (as the file shipped) UPDATE FAILED, order stayed paid
 *
 *    So the unguarded file would have rolled back a paid order because a
 *    WhatsApp message could not be queued. Both live siblings on this table
 *    already end with the guard (`tg_orders_notify_paid` from 102 and
 *    `tg_orders_notify_shipped` from 183, deployed bodies read off
 *    production), and finalize.ts makes the same call in TypeScript for the
 *    same reason: the card is already charged.
 *
 * 2. `fn_enqueue_whatsapp` WAS EXECUTABLE BY anon. A new function is EXECUTE-
 *    able by PUBLIC by default and 173 carried no REVOKE, so the function was
 *    reachable at /rest/v1/rpc/fn_enqueue_whatsapp by anyone on the internet.
 *    It is SECURITY DEFINER, so it runs as the owner and inserts past RLS.
 *    Proven on production in a rolled-back transaction: `SET ROLE anon`, one
 *    call, and a whatsapp_outbox row appeared for an opted-in customer's phone
 *    with an attacker-chosen kind and payload -- a message the cron drain
 *    would have sent over WhatsApp, from the store, to a real customer. The
 *    consent gate is no defence: it checks that the DESTINATION opted in, not
 *    who asked for the send, and an opted-in phone is the valuable target.
 *
 *    After the REVOKEs, anon and authenticated both get "permission denied"
 *    and plant zero rows, while the trigger path still enqueues normally --
 *    Postgres does not check EXECUTE on trigger dispatch. 095's
 *    `fn_enqueue_notification` already had exactly these grants, which is the
 *    shape the header claimed to copy.
 *
 * This test pins both fixes to the file, because both are single lines whose
 * absence is invisible in review and only shows up in production.
 */

const WHATSAPP_SQL = 'migrations/applied/173_whatsapp_flow.sql'

function sql(): string {
  return readFileSync(resolve(process.cwd(), WHATSAPP_SQL), 'utf8')
}

describe('173 whatsapp flow: the guards it shipped without', () => {
  it('keeps the order trigger best-effort, so a queue failure cannot undo a payment', () => {
    const body = sql()
    const start = body.indexOf('FUNCTION public.tg_orders_whatsapp_status')
    expect(start).toBeGreaterThan(-1)
    const fn = body.slice(start, body.indexOf('$$;', start))

    expect(fn).toContain('EXCEPTION WHEN OTHERS THEN')
    expect(fn).toContain("RAISE WARNING 'tg_orders_whatsapp_status failed for order %")
    // The guard is worthless if it swallows the row instead of returning it.
    expect(fn.slice(fn.indexOf('EXCEPTION WHEN OTHERS THEN'))).toContain('RETURN NEW')
  })

  it('lets no client role execute the enqueue function or the trigger function', () => {
    const body = sql()
    for (const fn of [
      'public.fn_enqueue_whatsapp(text, text, text, jsonb)',
      'public.tg_orders_whatsapp_status()',
      'public.fn_il_phone_digits(text)',
    ]) {
      for (const role of ['PUBLIC', 'anon', 'authenticated']) {
        expect(body).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM ${role};`)
      }
    }
  })

  it('never grants either function back to a client role', () => {
    const body = sql()
    expect(body).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_enqueue_whatsapp/i)
    expect(body).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.tg_orders_whatsapp_status/i)
  })
})
