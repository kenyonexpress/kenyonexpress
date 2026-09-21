import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CONTACT_CHANNEL_KEYS,
  DEFAULT_CONTACT_CHANNELS,
  DEFAULT_PAGE_CONTACT_CONFIGS,
  activeChannels,
  askBusinessHref,
  channelHref,
  matchesRouteTemplate,
  openerFor,
  resolvePageConfig,
} from './channels'

const cs = DEFAULT_CONTACT_CHANNELS[0] as (typeof DEFAULT_CONTACT_CHANNELS)[number]

describe('defaults mirror migration 236', () => {
  const sql = readFileSync('migrations/pending/236_contact_channels.sql', 'utf8')

  it('seeds every key the code knows, with the same opener', () => {
    for (const channel of DEFAULT_CONTACT_CHANNELS) {
      expect(sql).toContain(`('${channel.key}',`)
      expect(sql).toContain(channel.messageHe)
    }
    expect(DEFAULT_CONTACT_CHANNELS.map((c) => c.key)).toEqual([...CONTACT_CHANNEL_KEYS])
  })

  it('seeds every route template the code defaults', () => {
    for (const config of DEFAULT_PAGE_CONTACT_CONFIGS) {
      expect(sql).toContain(`('${config.routeTemplate}',`)
    }
  })
})

describe('matchesRouteTemplate', () => {
  it('fills a [param] segment and stops at a segment boundary', () => {
    expect(matchesRouteTemplate('/product/[slug]', '/product/airpods-pro-2')).toBe(true)
    expect(matchesRouteTemplate('/product/[slug]', '/products')).toBe(false)
    expect(matchesRouteTemplate('/checkout', '/checkout/return')).toBe(true)
    expect(matchesRouteTemplate('/checkout', '/checkouts')).toBe(false)
    expect(matchesRouteTemplate('/s/[id]', '/s/5eed0000')).toBe(true)
  })
})

describe('resolvePageConfig', () => {
  it('prefers the longest matching template and ignores inactive ones', () => {
    const configs = [
      ...DEFAULT_PAGE_CONTACT_CONFIGS,
      {
        routeTemplate: '/suppliers',
        channelKey: 'customer_service' as const,
        messageHe: null,
        active: true,
      },
    ]
    expect(resolvePageConfig('/suppliers/apply', configs)?.channelKey).toBe('supplier_join')
    expect(resolvePageConfig('/suppliers', configs)?.channelKey).toBe('customer_service')
    expect(resolvePageConfig('/about', configs)).toBeNull()
    expect(
      resolvePageConfig(
        '/suppliers/apply',
        configs.map((c) => ({ ...c, active: false })),
      ),
    ).toBeNull()
  })
})

describe('openerFor', () => {
  const product = DEFAULT_PAGE_CONTACT_CONFIGS[0] ?? null
  it('fills {name} and falls back to the channel sentence', () => {
    expect(openerFor(cs, product, 'עיסוי זוגי')).toBe(
      'שלום, יש לי שאלה על עיסוי זוגי בקניון אקספרס.',
    )
    expect(openerFor(cs, product, '  ')).toBe('שלום, יש לי שאלה על בקניון אקספרס.')
    expect(openerFor(cs, null, 'x')).toBe(cs.messageHe)
  })
})

describe('channelHref', () => {
  it('uses the channel number, else the store number, and encodes the Hebrew', () => {
    expect(channelHref(cs, '972524635550')).toBe(
      `https://wa.me/972524635550?text=${encodeURIComponent(cs.messageHe)}`,
    )
    expect(channelHref({ ...cs, number: '972501234567' }, '972524635550')).toContain(
      'wa.me/972501234567',
    )
    expect(channelHref(cs, null)).toBeNull()
  })
})

describe('askBusinessHref', () => {
  it('goes to the supplier only when the product allows it and the number exists', () => {
    const viaSupplier = askBusinessHref({
      supplierWhatsapp: '050-123-4567',
      whatsappEnabled: true,
      name: 'עיסוי',
      customerService: cs,
      storeNumber: '972524635550',
      supplierOpener: 'שלום, שאלה על עיסוי',
    })
    expect(viaSupplier?.via).toBe('supplier')
    expect(viaSupplier?.href).toContain('wa.me/972501234567')

    const fallback = askBusinessHref({
      supplierWhatsapp: '050-123-4567',
      whatsappEnabled: false,
      name: 'עיסוי',
      customerService: cs,
      storeNumber: '972524635550',
      supplierOpener: 'x',
    })
    expect(fallback?.via).toBe('customer_service')
    expect(decodeURIComponent(fallback?.href ?? '')).toContain('שאלה על עיסוי')

    expect(
      askBusinessHref({
        supplierWhatsapp: null,
        whatsappEnabled: true,
        name: null,
        customerService: null,
        storeNumber: null,
        supplierOpener: 'x',
      }),
    ).toBeNull()
  })
})

describe('activeChannels', () => {
  it('sorts by operator order and drops inactive rows', () => {
    const list = activeChannels([
      { ...cs, key: 'suggestions', sortOrder: 5, active: false },
      { ...cs, key: 'site_problem', sortOrder: 2 },
      { ...cs, sortOrder: 1 },
    ])
    expect(list.map((c) => c.key)).toEqual(['customer_service', 'site_problem'])
  })
})
