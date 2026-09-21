'use client'

import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { track } from '@/lib/analytics/tracker'
import { t } from '@/lib/i18n/messages'
import { useId, useState } from 'react'

export interface TopicOption {
  key: string
  label: string
  href: string
}

/**
 * Pick a topic, open WhatsApp with the topic's own opener. One component for
 * the /contact page and the floating button; the hrefs are computed on the
 * server (numbers and openers live there), this only chooses and counts.
 *
 * The tap is counted BEFORE the window opens, on the same `whatsapp_click`
 * name the PDP share uses, with `channel` and `surface` as props: a new event
 * name would be dropped by the ingest whitelist (registry test), a prop is not.
 */
export default function ContactTopicPicker({
  topics,
  surface,
  compact = false,
}: {
  topics: readonly TopicOption[]
  surface: 'contact_page' | 'float' | 'footer'
  compact?: boolean
}) {
  const [selected, setSelected] = useState(topics[0]?.key ?? '')
  const id = useId()
  const current = topics.find((topic) => topic.key === selected) ?? topics[0]
  if (!current) return null

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'} data-testid={`contact-picker-${surface}`}>
      <label htmlFor={id} className="block text-sm font-semibold text-heading">
        {t('contact.pickTopic')}
      </label>
      <select
        id={id}
        value={current.key}
        onChange={(event) => setSelected(event.target.value)}
        className="w-full rounded-lg border border-black/15 bg-surface px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {topics.map((topic) => (
          <option key={topic.key} value={topic.key}>
            {topic.label}
          </option>
        ))}
      </select>
      <a
        href={current.href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="contact-picker-link"
        data-channel={current.key}
        onClick={() => track('whatsapp_click', { channel: current.key, surface })}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-whatsapp px-5 text-sm font-bold text-white transition-transform hover:scale-[1.02]"
      >
        <WhatsAppIcon size={20} />
        {t('contact.openChat')}
      </a>
    </div>
  )
}
