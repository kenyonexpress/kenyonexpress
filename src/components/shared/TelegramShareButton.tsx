'use client'

import TelegramIcon from '@/components/shared/TelegramIcon'
import { t } from '@/lib/i18n/messages'

/**
 * Telegram's share endpoint, same shape as FacebookShareButton: a URL and a
 * text param, read at click time so a share from a page carrying campaign
 * parameters shares the page the customer is actually on.
 */
export default function TelegramShareButton({
  text,
  label = t('share.telegramLabel'),
  className,
}: {
  text?: string
  label?: string
  className?: string
}) {
  const handleClick = () => {
    const params = new URLSearchParams({ url: window.location.href })
    if (text) params.set('text', text)
    window.open(
      `https://t.me/share/url?${params.toString()}`,
      '_blank',
      'noopener,noreferrer,width=600,height=500',
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        'inline-flex items-center gap-2 text-sm font-semibold text-heading transition-colors hover:opacity-80'
      }
    >
      <TelegramIcon size={18} />
      {label}
    </button>
  )
}
