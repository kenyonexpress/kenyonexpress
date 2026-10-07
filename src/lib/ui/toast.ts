/**
 * Toasts without sonner on the first paint.
 *
 * `CartProvider` sits in every storefront route's client graph, and its one
 * `import { toast } from 'sonner'` put the whole library (40 KB raw, 11.8 KB
 * gzipped, STEP 34 measurement) in every first load, before any feedback
 * existed to show. The `<Toaster>` was already deferred (DeferredStoreChrome,
 * DeferredToaster); this is the other half: the library is imported on the
 * first `notify()` call, which is a user action away from the first paint.
 *
 * Ordering is preserved per call site: a second toast issued while the import
 * is in flight waits on the same promise, so "added" never overtakes "failed".
 * A failed chunk load (ad blocker, flaky network) drops the toast rather than
 * throwing into a cart mutation.
 */

export type ToastKind = 'success' | 'error' | 'info'

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

export function notify(kind: ToastKind, message: string): void {
  void sonner()
    .then((toast) => {
      toast[kind](message)
    })
    .catch(() => {})
}
