'use client'

import { t } from '@/lib/i18n/messages'
import { Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'

/** Copies the current page URL and confirms with a toast, nothing else. */
export default function CopyLinkButton({
  label = t('share.copyLinkLabel'),
  className,
  url,
}: {
  label?: string
  className?: string
  /** The URL to copy instead of the bare page URL, read at click time. */
  url?: () => string
}) {
  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(url ? url() : window.location.href)
      toast.success(t('share.linkCopied'))
    } catch {
      toast.error(t('share.linkCopyFailed'))
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className={
        className ??
        'inline-flex items-center gap-2 text-sm font-semibold text-heading transition-colors hover:opacity-80'
      }
    >
      <LinkIcon size={18} />
      {label}
    </button>
  )
}
