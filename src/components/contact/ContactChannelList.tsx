'use client'

import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { track } from '@/lib/analytics/tracker'
import { type ContactChannelKey, isContactChannelKey } from '@/lib/contact/channels'
import { type MessageKey, t } from '@/lib/i18n/messages'
import { Bug, Handshake, Headset, Lightbulb, type LucideIcon, Store } from 'lucide-react'

export interface ChannelOption {
  key: string
  label: string
  href: string
}

/**
 * The contact channels as a visible list on /contact: one card per channel,
 * each a wa.me link that opens with the channel's own Hebrew sentence.
 *
 * WHY A LIST HERE AND A <select> IN THE FLOAT. The picker (ContactTopicPicker)
 * fits a small sheet, and it shows one topic at a time. On the page whose whole
 * purpose is "how do I reach you", four of the five channels were behind a
 * closed dropdown: a business owner looking for "join as a supplier" saw
 * "customer service" and a button. Here every channel is on the page, with one
 * line saying what it is for, and one tap opens the chat.
 *
 * The hrefs are computed on the server (`topicsFor`: numbers and openers live
 * there); this only renders and counts. The tap is counted on `whatsapp_click`
 * with `channel` and `surface` props, the same shape the picker sends, so the
 * two surfaces stay comparable and no new event name meets the ingest
 * whitelist. The customer sends the message; the site sends nothing.
 *
 * The one-line purpose is keyed by channel in the catalog, not stored in the
 * `contact_channels` table: the table lets an operator change a number or an
 * opener, and a row with a key this file does not know simply renders without
 * the line.
 */
const HINT: Record<ContactChannelKey, MessageKey> = {
  customer_service: 'contact.hintCustomerService',
  suggestions: 'contact.hintSuggestions',
  business_partnerships: 'contact.hintPartnerships',
  site_problem: 'contact.hintSiteProblem',
  supplier_join: 'contact.hintSupplierJoin',
}

const ICON: Record<ContactChannelKey, LucideIcon> = {
  customer_service: Headset,
  suggestions: Lightbulb,
  business_partnerships: Handshake,
  site_problem: Bug,
  supplier_join: Store,
}

export default function ContactChannelList({ channels }: { channels: readonly ChannelOption[] }) {
  if (channels.length === 0) return null

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="contact-channel-list">
      {channels.map((channel) => {
        const known = isContactChannelKey(channel.key) ? channel.key : null
        const Icon = known ? ICON[known] : Headset
        return (
          <li key={channel.key}>
            <a
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="contact-channel-link"
              data-channel={channel.key}
              onClick={() =>
                track('whatsapp_click', { channel: channel.key, surface: 'contact_page' })
              }
              className="flex h-full min-h-11 flex-col gap-2 rounded-2xl border border-black/10 bg-surface p-4 transition-colors hover:border-whatsapp-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="flex items-center gap-2 text-base font-bold text-heading">
                <Icon size={20} aria-hidden="true" />
                {channel.label}
              </span>
              {known && (
                <span className="text-sm leading-relaxed text-heading/80">{t(HINT[known])}</span>
              )}
              {/* text-whatsapp-ink, not the bright mark: 7.67:1 on white
                  (tokens.css), where #25d366 text measures under 2:1. */}
              <span className="mt-auto inline-flex items-center gap-2 pt-1 text-sm font-bold text-whatsapp-ink">
                <WhatsAppIcon size={18} />
                {t('contact.openChat')}
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}
