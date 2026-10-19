/**
 * Turnstile tokens are single use. After a submission comes back with an
 * error the widget must be reset, or the shopper's retry is refused as a bot.
 */
export function resetTurnstile(): void {
  const api = (globalThis as { turnstile?: { reset?: () => void } }).turnstile
  try {
    api?.reset?.()
  } catch {
    // No widget on the page (keys unset): nothing to reset.
  }
}
