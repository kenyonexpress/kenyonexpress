import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMAIL_PREVIEWS, PREVIEW_SITE_URL } from './previews'

const ROOT = resolve(__dirname, '../../..')

/**
 * The gallery is only worth having if it is COMPLETE.
 *
 * A preview page listing twelve of fourteen mails is worse than none: it reads
 * as "these are the mails", and the two nobody can see are the two that will
 * ship broken. So the list is checked against the kinds the system can actually
 * enqueue, in both directions.
 */

/** Every kind `notification_outbox_kind_check` accepts, from the type union. */
function kindsFromSource(): string[] {
  const source = readFileSync(join(ROOT, 'src/lib/email/notifications.ts'), 'utf8')
  const union = source.slice(
    source.indexOf('export type NotificationKind'),
    source.indexOf('function escapeHtml'),
  )
  return [...union.matchAll(/\|\s*'([a-z_]+)'/g)].map((m) => m[1] as string)
}

describe('the gallery covers every mail', () => {
  it('has a preview for every notification kind', () => {
    // The direction that matters. A kind added without a sample is a mail
    // nobody will ever look at before a customer does.
    const kinds = kindsFromSource()
    expect(kinds.length).toBeGreaterThan(10)
    // Matched on `preview.kind` and not on `preview.id`: since
    // `referral_bonus_credited` needs one sample per `role`, an id is no longer
    // one-to-one with a kind, and matching on ids would report a covered kind
    // as missing.
    const covered = new Set<string>(
      EMAIL_PREVIEWS.map((p) => p.kind).filter((kind): kind is NonNullable<typeof kind> =>
        Boolean(kind),
      ),
    )
    const missing = kinds.filter((kind) => !covered.has(kind))
    expect(missing, `kinds with no preview: ${missing.join(', ')}`).toEqual([])
  })

  it('has no preview for a kind that no longer exists', () => {
    // The other direction. A stale sample renders happily and describes a mail
    // the system cannot send.
    const kinds = new Set(kindsFromSource())
    // A preview that is not an outbox row at all carries `kind: null` and is
    // skipped here by construction. That replaced an allowlist of two ids: the
    // login link goes out from the auth action and the voucher mail from
    // `finalizeOrder`, and saying so on the preview beats keeping a list in the
    // test that nobody updates.
    const orphans = EMAIL_PREVIEWS.filter((p) => p.kind !== null && !kinds.has(p.kind)).map(
      (p) => p.id,
    )
    expect(orphans, `previews with no kind: ${orphans.join(', ')}`).toEqual([])
  })

  it('gives every preview a unique id and a Hebrew label', () => {
    const ids = EMAIL_PREVIEWS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preview of EMAIL_PREVIEWS) {
      expect(preview.labelHe, preview.id).toMatch(/[֐-׿]/)
    }
  })
})

describe('every sample actually builds', () => {
  it.each(EMAIL_PREVIEWS.map((p) => [p.id, p] as const))('%s renders', (_id, preview) => {
    // Not a formality. A sample payload drifts from its builder the moment the
    // builder gains a required field, and the failure is a 500 on a page
    // somebody opened to check a layout.
    const built = preview.build(PREVIEW_SITE_URL)
    expect(built.subject.length).toBeGreaterThan(0)
    expect(built.html).toContain('<div')
    expect(built.text.length).toBeGreaterThan(0)
  })

  it('produces a right-to-left document for every customer-facing mail', () => {
    // The one property that cannot be got wrong silently: an RTL mail without
    // `dir="rtl"` renders left-aligned in every client and looks like somebody
    // else's mail.
    for (const preview of EMAIL_PREVIEWS.filter((p) => p.audience === 'customer')) {
      expect(preview.build(PREVIEW_SITE_URL).html, preview.id).toContain('dir="rtl"')
    }
  })

  it('never leaks a raw template placeholder', () => {
    for (const preview of EMAIL_PREVIEWS) {
      const built = preview.build(PREVIEW_SITE_URL)
      expect(built.html, preview.id).not.toMatch(/\{\{|\$\{/)
      expect(built.subject, preview.id).not.toMatch(/undefined|\[object/)
    }
  })
})
