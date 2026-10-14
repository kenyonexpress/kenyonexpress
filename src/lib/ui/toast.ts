/**
 * The site's one toast API (UX28), and the only place sonner is called.
 *
 * WHY ONE ENTRY. Measured on the build of a1ee1c030 (logs/ux28/before.json):
 * twelve files imported `toast` from sonner directly, and the policy a toast
 * carried depended on which file raised it. Four identical "נוסף להשוואה"
 * presses were four toasts (three visible, one queued behind); an error lived
 * 4.1s against a success's 4.0s, so a refusal the shopper did not catch was
 * gone before they looked up; and twenty-five of the call sites were in the
 * admin panel, whose layout mounted no toaster at all, so every one of them
 * was a function call that painted nothing. The kind now decides the lifetime,
 * the message decides the identity, and the toaster is mounted wherever a
 * `notify()` call can run (pinned by src/__tests__/toast-entry-points.test.ts).
 *
 * WHY LAZY. `CartProvider` sits in every storefront route's client graph, and
 * a static `import { toast } from 'sonner'` put the whole library (40 KB raw,
 * 11.8 KB gzipped, STEP 34 measurement) in every first load, before any
 * feedback existed to show. The library is imported on the first `notify()`
 * call, which is a user action away from the first paint. Ordering is
 * preserved per call site: a second toast issued while the import is in
 * flight waits on the same promise, so "added" never overtakes "failed". A
 * failed chunk load (ad blocker, flaky network) drops the toast rather than
 * throwing into a cart mutation.
 */

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface ToastAction {
  label: string
  /** Pressing the action dismisses the toast; the handler runs first. */
  onClick: () => void
}

export interface NotifyOptions {
  /** A second, quieter line under the message. */
  description?: string
  /** One button inside the toast (undo, "to the compare page"). */
  action?: ToastAction
  /**
   * Two toasts with one id are ONE toast: the second call updates the first
   * in place and restarts its clock. Defaults to the kind and the message
   * (`toastId`), so a repeated identical message never stacks.
   */
  id?: string
  /** Overrides the kind's lifetime, in milliseconds. */
  duration?: number
}

/**
 * How long each kind stays, in milliseconds. A success is a receipt and goes
 * quickly; an error is something to read, and 8s is still an auto-dismiss, so
 * the stack never fills with stale refusals. Every kind also closes on the
 * close button, on swipe, and on the action.
 */
export const TOAST_DURATION_MS: Readonly<Record<ToastKind, number>> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
}

/** Toasts painted at once; older ones queue behind the stack (sonner's own cap). */
export const MAX_VISIBLE_TOASTS = 3

/** The default identity of a toast: the same words, the same kind, one toast. */
export function toastId(kind: ToastKind, message: string): string {
  return `ke:${kind}:${message}`
}

type SonnerToast = typeof import('sonner')['toast']

let pending: Promise<SonnerToast> | null = null

function sonner(): Promise<SonnerToast> {
  if (!pending) {
    pending = import('sonner')
      .then((mod) => mod.toast)
      .catch((error: unknown) => {
        pending = null
        throw error
      })
  }
  return pending
}

/** Raises a toast. Returns its id, for `dismissToast`. */
export function notify(kind: ToastKind, message: string, options: NotifyOptions = {}): string {
  const id = options.id ?? toastId(kind, message)
  void sonner()
    .then((toast) => {
      toast[kind](message, {
        id,
        duration: options.duration ?? TOAST_DURATION_MS[kind],
        description: options.description,
        action: options.action,
      })
    })
    .catch(() => {})
  return id
}

/** Closes one toast by id, or every toast when called without one. */
export function dismissToast(id?: string): void {
  void sonner()
    .then((toast) => {
      toast.dismiss(id)
    })
    .catch(() => {})
}
