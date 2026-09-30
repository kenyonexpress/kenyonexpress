import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildWhatsAppText } from './messages'
import {
  TEMPLATE_CATALOGUE,
  WHATSAPP_TEMPLATE_KINDS,
  buildWhatsAppTemplate,
  contentSidFor,
  renderTemplatePreview,
  templateSpec,
  variable,
} from './templates'

/**
 * The template catalogue is a promise to Meta and to the customer at once:
 * what we submit for approval is what the drain fills in. These tests keep
 * the three copies of that promise (the catalogue, the variable builder and
 * the free-text fallback) saying the same thing, and keep the catalogue
 * post-purchase only.
 */

const ENV: Partial<NodeJS.ProcessEnv> = {
  TWILIO_CONTENT_SID_ORDER_PAID: 'HXpaid',
  TWILIO_CONTENT_SID_ORDER_SHIPPED: 'HXshipped',
  TWILIO_CONTENT_SID_ORDER_FULFILLED: 'HXfulfilled',
  TWILIO_CONTENT_SID_ORDER_CANCELLED: 'HXcancelled',
  TWILIO_CONTENT_SID_ORDER_REFUNDED: 'HXrefunded',
  TWILIO_CONTENT_SID_SUPPORT_INBOUND: 'HXsupport',
}

const PAYLOAD = {
  order_id: 'abcdef12-3456-7890-abcd-ef1234567890',
  order_ref: 'ABCDEF12',
  customer_name: 'דנה',
  total_agorot: 12990,
  shipments: [{ carrier: 'דואר ישראל', tracking_number: 'RR123456789IL' }],
}

/** Meta's UTILITY-only, post-purchase-only rule: what the catalogue must never name. */
const MARKETING_KINDS = [
  'price_drop',
  'back_in_stock',
  'voucher_expiring',
  'voucher_issued',
  'voucher_gifted',
  'welcome',
  'cashback_credited',
  'gift_card_issued',
  'newsletter',
  'promotion',
]

describe('the catalogue', () => {
  it('is post-purchase support only: every entry is UTILITY and nothing markets', () => {
    for (const spec of TEMPLATE_CATALOGUE) {
      expect(spec.category).toBe('UTILITY')
      expect(MARKETING_KINDS).not.toContain(spec.kind)
    }
    expect(TEMPLATE_CATALOGUE.map((s) => s.kind)).toEqual([...WHATSAPP_TEMPLATE_KINDS])
  })

  it('names one distinct env var per kind, all of the TWILIO_CONTENT_SID_ prefix', () => {
    const vars = TEMPLATE_CATALOGUE.map((s) => s.envVar)
    expect(new Set(vars).size).toBe(vars.length)
    for (const v of vars) expect(v).toMatch(/^TWILIO_CONTENT_SID_[A-Z_]+$/)
  })

  it('every customer template ends with the opt-out line, no variable at the very end', () => {
    for (const spec of TEMPLATE_CATALOGUE.filter((s) => s.audience === 'customer')) {
      expect(spec.body.endsWith('להסרה מעדכוני וואטסאפ השיבו: הסר')).toBe(true)
      expect(spec.body.startsWith('{{')).toBe(false)
    }
  })

  it('describes exactly as many variables as the body has placeholders', () => {
    for (const spec of TEMPLATE_CATALOGUE) {
      const placeholders = new Set(spec.body.match(/\{\{\d+\}\}/g) ?? [])
      expect(placeholders.size, spec.kind).toBe(spec.variables.length)
      for (let i = 1; i <= spec.variables.length; i++) {
        expect(placeholders.has(`{{${i}}}`), `${spec.kind} {{${i}}}`).toBe(true)
      }
    }
  })

  it('is documented for the person who submits it: every env var and body is in the doc', () => {
    const doc = readFileSync(resolve(process.cwd(), 'docs/WHATSAPP-TEMPLATES.md'), 'utf8')
    for (const spec of TEMPLATE_CATALOGUE) {
      expect(doc, spec.envVar).toContain(spec.envVar)
      expect(doc, spec.kind).toContain(spec.body)
    }
    const example = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8')
    for (const spec of TEMPLATE_CATALOGUE) expect(example).toContain(spec.envVar)
  })
})

describe('contentSidFor', () => {
  it('reads the SID from the env var the catalogue names, trimmed, and null when unset or blank', () => {
    expect(contentSidFor('order_paid', ENV)).toBe('HXpaid')
    expect(contentSidFor('order_paid', { TWILIO_CONTENT_SID_ORDER_PAID: '  HXx  ' })).toBe('HXx')
    expect(contentSidFor('order_paid', {})).toBeNull()
    expect(contentSidFor('order_paid', { TWILIO_CONTENT_SID_ORDER_PAID: '   ' })).toBeNull()
    expect(contentSidFor('not_a_kind', ENV)).toBeNull()
    expect(templateSpec('not_a_kind')).toBeNull()
  })
})

describe('variable', () => {
  it('flattens line breaks and tabs, collapses runs of spaces, and never returns empty', () => {
    expect(variable('שורה\nשנייה\tטאב   רווחים')).toBe('שורה שנייה טאב רווחים')
    expect(variable('')).toBe('-')
    expect(variable(null, 'ללא')).toBe('ללא')
    expect(variable(42)).toBe('42')
  })

  it('caps long values with an ellipsis', () => {
    const long = 'א'.repeat(400)
    expect(variable(long).length).toBe(300)
    expect(variable(long).endsWith('…')).toBe(true)
  })
})

describe('buildWhatsAppTemplate', () => {
  it('order_paid fills name, ref and the shekel total from agorot', () => {
    const message = buildWhatsAppTemplate('order_paid', PAYLOAD, ENV)
    expect(message).toEqual({
      contentSid: 'HXpaid',
      variables: { '1': 'דנה', '2': 'ABCDEF12', '3': expect.stringContaining('129.90') },
    })
    expect(renderTemplatePreview('order_paid', message?.variables ?? {})).toContain(
      'הזמנה ABCDEF12 נקלטה',
    )
  })

  it('order_shipped folds every tracked line into one variable, and says so when none', () => {
    expect(buildWhatsAppTemplate('order_shipped', PAYLOAD, ENV)?.variables['3']).toBe(
      'דואר ישראל RR123456789IL',
    )
    expect(
      buildWhatsAppTemplate('order_shipped', { ...PAYLOAD, shipments: [] }, ENV)?.variables['3'],
    ).toBe('יעודכן')
    expect(
      buildWhatsAppTemplate(
        'order_shipped',
        {
          ...PAYLOAD,
          shipments: [
            { carrier: null, tracking_number: 'A1' },
            { carrier: 'DHL', tracking_number: 'B2' },
            { carrier: 'X', tracking_number: '' },
          ],
        },
        ENV,
      )?.variables['3'],
    ).toBe('A1, DHL B2')
  })

  it('the three plain lifecycle kinds carry name and ref only', () => {
    for (const kind of ['order_fulfilled', 'order_cancelled', 'order_refunded']) {
      expect(buildWhatsAppTemplate(kind, PAYLOAD, ENV)?.variables).toEqual({
        '1': 'דנה',
        '2': 'ABCDEF12',
      })
    }
  })

  it('greets a nameless profile with the neutral plural, and takes the ref from the id', () => {
    const message = buildWhatsAppTemplate(
      'order_cancelled',
      { order_id: PAYLOAD.order_id, customer_name: null },
      ENV,
    )
    expect(message?.variables).toEqual({ '1': 'לקוחות יקרים', '2': 'ABCDEF12' })
  })

  it('a missing total renders as a dash rather than ₪0.00', () => {
    expect(
      buildWhatsAppTemplate('order_paid', { ...PAYLOAD, total_agorot: undefined }, ENV)?.variables[
        '3'
      ],
    ).toBe('-')
  })

  it('returns null without a SID, without a ref, or for a kind outside the catalogue', () => {
    expect(buildWhatsAppTemplate('order_paid', PAYLOAD, {})).toBeNull()
    expect(buildWhatsAppTemplate('order_paid', { customer_name: 'x' }, ENV)).toBeNull()
    expect(buildWhatsAppTemplate('order_teleported', PAYLOAD, ENV)).toBeNull()
  })

  it('support_inbound carries phone, ticket ref and a flattened excerpt of the message', () => {
    const message = buildWhatsAppTemplate(
      'support_inbound',
      { phone: '972501234567', ticket_ref: 'TICKET12', body: 'שלום,\nההזמנה לא הגיעה' },
      ENV,
    )
    expect(message).toEqual({
      contentSid: 'HXsupport',
      variables: { '1': '972501234567', '2': 'TICKET12', '3': 'שלום, ההזמנה לא הגיעה' },
    })
    expect(buildWhatsAppTemplate('support_inbound', { phone: '972501234567' }, ENV)).toBeNull()
  })

  it('says what the free-text fallback says: same ref, same facts, for every order kind', () => {
    for (const kind of [
      'order_paid',
      'order_shipped',
      'order_fulfilled',
      'order_cancelled',
      'order_refunded',
    ]) {
      const template = buildWhatsAppTemplate(kind, PAYLOAD, ENV)
      const preview = renderTemplatePreview(kind, template?.variables ?? {})
      const text = buildWhatsAppText(kind, PAYLOAD)
      expect(preview, kind).toContain('ABCDEF12')
      expect(text, kind).toContain('ABCDEF12')
      expect(preview, kind).toContain('הסר')
      expect(text, kind).toContain('הסר')
    }
  })
})
