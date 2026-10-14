'use client'

import { MAX_VISIBLE_TOASTS, TOAST_DURATION_MS } from '@/lib/ui/toast'
import { CircleCheck, Info, OctagonX, TriangleAlert } from 'lucide-react'
import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

/** The region's name. Sonner appends the hotkey, so VoiceOver reads "התראות alt+T". */
export const TOASTER_ARIA_LABEL = 'התראות'
/** The close button's name; sonner's default is the English "Close toast". */
export const TOAST_CLOSE_LABEL = 'סגירת ההודעה'

/**
 * The site's one toaster (UX28). Every mount is `<Toaster />` with no props,
 * because the policy below is the policy, and three layouts each repeating
 * `position="top-center" dir="rtl" richColors closeButton` was how the admin
 * panel came to have no toaster at all while its screens raised twenty-five
 * toasts into the void (measured, logs/ux28/before.json).
 *
 * - `theme="light"`, fixed. The site has no dark mode, and `useTheme()` from
 *   next-themes without a provider answered 'system', so a shopper whose OS is
 *   dark saw a black toast (rgb(0,31,15) with green text) on a white page.
 * - `position="top-center"`, `dir="rtl"`: the close button lands at the
 *   inline start (the right), where a Hebrew reader's eye enters the box.
 * - `visibleToasts={MAX_VISIBLE_TOASTS}`: three painted, the rest queue behind.
 * - `duration`: the Toaster's default is the success lifetime; `notify()` sets
 *   the kind's own on every toast, so this only covers a toast raised by
 *   something other than `notify()`, which the entry-points test forbids.
 * - `closeButton` on every toast, named in Hebrew, with a 44px hit box from
 *   globals.css (the painted glyph stays 20px).
 * - `mobileOffset={20}` below 600px, where sonner's own offset is 16. The
 *   close button hangs 7px outside the toast's top-right corner and its hit
 *   box 13px further; at 380 with a 16px offset the box ran to x 383 and
 *   y -4, off the screen on two sides (logs/ux28/after.json, first run). At
 *   20 the box ends at 379 and starts at 0: every point of it can be tapped.
 * - STEP 32: sonner's default region name is "Notifications alt+T", in
 *   English, and it was the one landmark on every page a Hebrew screen reader
 *   read in the wrong language. The hotkey still works; only the name changes.
 */
const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-center"
      dir="rtl"
      richColors
      closeButton
      visibleToasts={MAX_VISIBLE_TOASTS}
      duration={TOAST_DURATION_MS.success}
      mobileOffset={20}
      className="toaster group ke-toaster"
      containerAriaLabel={TOASTER_ARIA_LABEL}
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
      }}
      toastOptions={{
        closeButtonAriaLabel: TOAST_CLOSE_LABEL,
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
