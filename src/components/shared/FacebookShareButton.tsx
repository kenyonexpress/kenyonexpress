'use client'

import FacebookIcon from '@/components/shared/FacebookIcon'

/**
 * Facebook's sharer, which takes a URL and NOTHING ELSE.
 *
 * The `quote` parameter this used to accept was removed by Facebook in 2017;
 * passing it today is silently ignored. Everything the post shows — title,
 * description, image — comes from the Open Graph tags Facebook scrapes off the
 * page, which is why `opengraph-image.tsx` beside the product page is not a
 * nicety here but the entire content of a Facebook share.
 *
 * The URL is read at click time rather than passed in, so a share from a page
 * carrying campaign parameters shares the page the customer is actually on.
 */
export default function FacebookShareButton({
  label = 'שיתוף בפייסבוק',
  className,
}: {
  label?: string
  className?: string
}) {
  const handleClick = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500')
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        'inline-flex items-center gap-2 text-sm font-semibold text-facebook transition-colors hover:opacity-80'
      }
    >
      <FacebookIcon size={18} />
      {label}
    </button>
  )
}
