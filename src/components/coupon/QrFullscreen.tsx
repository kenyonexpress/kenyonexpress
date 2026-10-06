'use client'

import { t } from '@/lib/i18n/messages'
import { useCallback, useEffect, useRef } from 'react'

/**
 * The QR code, filling the screen, for the moment the cashier points a scanner.
 *
 * WHY A `<dialog>` AND NOT THE FULLSCREEN API. `requestFullscreen` is refused
 * on iPhone Safari, which is the device this is held up on, and on desktop it
 * shows a browser banner over the top of the code. A modal dialog sized to the
 * viewport gives the same result everywhere: white background, one large QR,
 * the code in letters underneath for a scanner that fails, and Escape or the
 * button to leave. Nothing else on the page can intercept a tap while it is up.
 *
 * THE IMAGE IS THE SAME DATA URL THE CARD SHOWS, scaled by CSS. A QR is a grid
 * of squares, so scaling up stays crisp at `image-rendering: pixelated`; the
 * module count does not change and no second render is needed.
 *
 * Rendered only where the caller already decided the code may be shown: the
 * button is passed the data URL, and the pages pass one only for a presentable,
 * un-gifted voucher.
 */
export default function QrFullscreen({
  qrDataUrl,
  code,
  alt,
  className,
}: {
  qrDataUrl: string
  code: string
  alt: string
  className?: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const open = useCallback(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
  }, [])

  const close = useCallback(() => {
    dialogRef.current?.close()
  }, [])

  // Closing by tapping the backdrop: the only target outside the panel is the
  // dialog element itself.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close()
    }
    dialog.addEventListener('click', onClick)
    return () => dialog.removeEventListener('click', onClick)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={className ?? 'account-btn'}
        data-testid="qr-fullscreen-open"
      >
        {t('qrFullscreen.open')}
      </button>
      <dialog
        ref={dialogRef}
        dir="rtl"
        aria-label={t('qrFullscreen.title')}
        data-testid="qr-fullscreen-dialog"
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-white p-0 text-gray-900 backdrop:bg-white"
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-4">
          <p className="text-sm text-gray-500">{t('qrFullscreen.hint')}</p>
          <img
            src={qrDataUrl}
            alt={alt}
            data-testid="qr-fullscreen-image"
            className="aspect-square w-[min(88vw,64vh)] [image-rendering:pixelated]"
          />
          <p dir="ltr" className="font-mono text-3xl font-bold tracking-widest">
            {code}
          </p>
          <button
            type="button"
            onClick={close}
            className="account-btn"
            data-testid="qr-fullscreen-close"
          >
            {t('qrFullscreen.close')}
          </button>
        </div>
      </dialog>
    </>
  )
}
