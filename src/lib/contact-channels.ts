/** Contact menu channels. Slugs are ASCII; labels are the Hebrew UI copy. */
export const CONTACT_CHANNELS = [
  { slug: 'service', label: 'שירות לקוחות' },
  { slug: 'suggestions', label: 'הצעות לשיפור' },
  { slug: 'business-partnerships', label: 'שיתופי פעולה עסקיים' },
  { slug: 'site-issue', label: 'תקלה באתר' },
  { slug: 'supplier-join', label: 'הצטרפות כספק' },
] as const

export type ContactChannel = (typeof CONTACT_CHANNELS)[number]['slug']

export const CONTACT_CHANNEL_SLUGS = CONTACT_CHANNELS.map((c) => c.slug) as [
  ContactChannel,
  ...ContactChannel[],
]

export function contactChannelLabel(slug: ContactChannel): string {
  return CONTACT_CHANNELS.find((c) => c.slug === slug)?.label ?? slug
}
