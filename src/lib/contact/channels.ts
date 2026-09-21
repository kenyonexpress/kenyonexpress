/**
 * WhatsApp contact topics: the pure half. Which topics exist, what each one
 * opens with, how a page picks its default topic, and how a "ask the
 * business" link falls back to customer service.
 *
 * The five rows below are the same five that migration 236 seeds. They are
 * here so the storefront renders the picker before 236 applies and keeps
 * rendering it if the read fails; the table is what lets an operator change
 * a number or a sentence without a deploy. `number: null` means "the store's
 * number" and is resolved by the caller (`storeWhatsAppNumber()`), so the
 * env override in lib/whatsapp.ts keeps working for every topic at once.
 */

import { waChatLink } from '@/lib/whatsapp'

/** `use cache` tag for every storefront read of the two tables; the admin actions `updateTag` it. */
export const CONTACT_CHANNELS_TAG = 'contact-channels'

export const CONTACT_CHANNEL_KEYS = [
  'customer_service',
  'suggestions',
  'business_partnerships',
  'site_problem',
  'supplier_join',
] as const

export type ContactChannelKey = (typeof CONTACT_CHANNEL_KEYS)[number]

export interface ContactChannel {
  key: ContactChannelKey
  labelHe: string
  /** E.164 digits without '+', or null for the store number. */
  number: string | null
  messageHe: string
  sortOrder: number
  active: boolean
}

export interface PageContactConfig {
  routeTemplate: string
  channelKey: ContactChannelKey
  /** Overrides the channel opener; `{name}` is the product or supplier name. */
  messageHe: string | null
  active: boolean
}

export const DEFAULT_CONTACT_CHANNELS: readonly ContactChannel[] = [
  {
    key: 'customer_service',
    labelHe: 'שירות לקוחות',
    number: null,
    messageHe: 'שלום, יש לי שאלה לשירות הלקוחות של קניון אקספרס.',
    sortOrder: 10,
    active: true,
  },
  {
    key: 'suggestions',
    labelHe: 'הצעות ורעיונות',
    number: null,
    messageHe: 'שלום, יש לי הצעה לשיפור קניון אקספרס.',
    sortOrder: 20,
    active: true,
  },
  {
    key: 'business_partnerships',
    labelHe: 'שיתופי פעולה',
    number: null,
    messageHe: 'שלום, אני מעוניין/ת בשיתוף פעולה עסקי עם קניון אקספרס.',
    sortOrder: 30,
    active: true,
  },
  {
    key: 'site_problem',
    labelHe: 'תקלה באתר',
    number: null,
    messageHe: 'שלום, נתקלתי בתקלה באתר קניון אקספרס. העמוד: ',
    sortOrder: 40,
    active: true,
  },
  {
    key: 'supplier_join',
    labelHe: 'הצטרפות כבית עסק',
    number: null,
    messageHe: 'שלום, אני בעל/ת עסק ורוצה להצטרף לקניון אקספרס.',
    sortOrder: 50,
    active: true,
  },
]

export const DEFAULT_PAGE_CONTACT_CONFIGS: readonly PageContactConfig[] = [
  {
    routeTemplate: '/product/[slug]',
    channelKey: 'customer_service',
    messageHe: 'שלום, יש לי שאלה על {name} בקניון אקספרס.',
    active: true,
  },
  {
    routeTemplate: '/s/[id]',
    channelKey: 'customer_service',
    messageHe: 'שלום, יש לי שאלה על בית העסק {name} בקניון אקספרס.',
    active: true,
  },
  {
    routeTemplate: '/checkout',
    channelKey: 'customer_service',
    messageHe: 'שלום, אני באמצע תשלום בקניון אקספרס וצריך/ה עזרה.',
    active: true,
  },
  {
    routeTemplate: '/account',
    channelKey: 'customer_service',
    messageHe: 'שלום, יש לי שאלה על ההזמנה שלי בקניון אקספרס.',
    active: true,
  },
  { routeTemplate: '/suppliers/apply', channelKey: 'supplier_join', messageHe: null, active: true },
]

export function isContactChannelKey(value: unknown): value is ContactChannelKey {
  return typeof value === 'string' && (CONTACT_CHANNEL_KEYS as readonly string[]).includes(value)
}

/** Active channels, in operator order. */
export function activeChannels(channels: readonly ContactChannel[]): ContactChannel[] {
  return channels.filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * `/product/[slug]` matches `/product/anything`; `/checkout` matches
 * `/checkout` and `/checkout/return`. Longest template wins, so `/suppliers/apply`
 * beats a hypothetical `/suppliers`.
 */
export function matchesRouteTemplate(template: string, pathname: string): boolean {
  const pattern = template
    .split('/')
    .map((segment) =>
      segment.startsWith('[') && segment.endsWith(']') ? '[^/]+' : escapeRegExp(segment),
    )
    .join('/')
  return new RegExp(`^${pattern}(?:/|$)`).test(pathname)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function resolvePageConfig(
  pathname: string,
  configs: readonly PageContactConfig[],
): PageContactConfig | null {
  const hits = configs
    .filter((c) => c.active && matchesRouteTemplate(c.routeTemplate, pathname))
    .sort((a, b) => b.routeTemplate.length - a.routeTemplate.length)
  return hits[0] ?? null
}

/** The opener with `{name}` filled in, or the channel's own sentence. */
export function openerFor(
  channel: ContactChannel,
  config: PageContactConfig | null,
  name: string | null | undefined,
): string {
  const template = config?.messageHe ?? channel.messageHe
  const trimmed = name?.trim()
  if (!trimmed)
    return template
      .replace(/\s*\{name\}\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  return template.replace(/\{name\}/g, trimmed)
}

/** wa.me link for a channel; `storeNumber` fills a null number. */
export function channelHref(
  channel: ContactChannel,
  storeNumber: string | null,
  text: string = channel.messageHe,
): string | null {
  const phone = channel.number ?? storeNumber
  return phone ? waChatLink(phone, text) : null
}

/**
 * "Ask the business": the supplier's own WhatsApp when the product has it
 * switched on and the supplier has a number; otherwise customer service, with
 * the same product name in the opener so the operator knows what was asked.
 */
export function askBusinessHref(input: {
  supplierWhatsapp: string | null | undefined
  whatsappEnabled: boolean
  name: string | null | undefined
  customerService: ContactChannel | null
  storeNumber: string | null
  supplierOpener: string
}): { href: string; via: 'supplier' | 'customer_service' } | null {
  if (input.whatsappEnabled && input.supplierWhatsapp) {
    const href = waChatLink(input.supplierWhatsapp, input.supplierOpener)
    if (href) return { href, via: 'supplier' }
  }
  if (!input.customerService) return null
  const config =
    DEFAULT_PAGE_CONTACT_CONFIGS.find((c) => c.routeTemplate === '/product/[slug]') ?? null
  const href = channelHref(
    input.customerService,
    input.storeNumber,
    openerFor(input.customerService, config, input.name),
  )
  return href ? { href, via: 'customer_service' } : null
}

export interface ContactTopic {
  key: string
  label: string
  href: string
}

/** Active channels as picker rows; a channel with no resolvable number is left out. */
export function topicsFor(
  channels: readonly ContactChannel[],
  storeNumber: string | null,
  textFor: (channel: ContactChannel) => string = (channel) => channel.messageHe,
): ContactTopic[] {
  const out: ContactTopic[] = []
  for (const channel of channels) {
    const href = channelHref(channel, storeNumber, textFor(channel))
    if (href) out.push({ key: channel.key, label: channel.labelHe, href })
  }
  return out
}
