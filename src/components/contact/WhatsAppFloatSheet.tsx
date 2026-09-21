'use client'

import ContactTopicPicker, { type TopicOption } from '@/components/contact/ContactTopicPicker'
import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { t } from '@/lib/i18n/messages'
import { useState } from 'react'

/**
 * The floating button, now a topic sheet. With one topic it is the old
 * single link (no sheet to open for a choice of one). The button itself
 * stays a plain anchor in that case so nothing here needs JavaScript to
 * reach WhatsApp.
 */
export default function WhatsAppFloatSheet({ topics }: { topics: readonly TopicOption[] }) {
  const [open, setOpen] = useState(false)
  const only = topics.length === 1 ? topics[0] : null
  if (topics.length === 0) return null

  const buttonClass =
    'fixed bottom-[5.25rem] end-5 z-40 md:bottom-5 w-14 h-14 rounded-full bg-whatsapp text-white shadow-lg shadow-black/20 flex items-center justify-center transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whatsapp'

  if (only) {
    return (
      <a
        href={only.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('contact.floatLabel')}
        title={t('contact.floatLabel')}
        className={buttonClass}
        data-testid="whatsapp-float"
      >
        <WhatsAppIcon size={30} />
      </a>
    )
  }

  return (
    <>
      {open && (
        <dialog
          open
          aria-label={t('contact.pickTopic')}
          className="fixed bottom-[9.5rem] end-5 z-40 m-0 w-72 rounded-2xl border border-black/10 bg-surface p-4 text-start shadow-xl md:bottom-[5.5rem]"
          data-testid="whatsapp-float-sheet"
        >
          <ContactTopicPicker topics={topics} surface="float" compact />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 text-xs text-heading/70 underline underline-offset-2"
          >
            {t('contact.close')}
          </button>
        </dialog>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('contact.floatLabel')}
        title={t('contact.floatLabel')}
        className={buttonClass}
        data-testid="whatsapp-float"
      >
        <WhatsAppIcon size={30} />
      </button>
    </>
  )
}
