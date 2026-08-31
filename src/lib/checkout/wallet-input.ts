/**
 * What the wallet box is allowed to post.
 *
 * `min`, `max` and `step` are on the input already, and none of them does
 * anything: the checkout form carries `noValidate`, which is what lets it run
 * its own step gate, and which also switches off every native constraint on
 * every field in it. So the ceiling on that box was decoration - typing a
 * number above it posted that number.
 *
 * The server does hold. It refuses more than the balance in Hebrew, and the
 * settlement engine throws on more than the on-site charge. But that second
 * one arrives as `RangeError: wallet applied must not exceed the on-site
 * charge` - an English engine string shown to a Hebrew shopper, under a
 * "נסו שוב" button, because the code it comes back with is VALIDATION and that
 * is classified retryable. Pressing it repeats the same refusal forever.
 *
 * Reachable with no hostile intent at all: a wallet balance larger than the
 * order, which is the ordinary state after a cashback on a big purchase, and a
 * shopper who types the balance they were just shown.
 *
 * Clamping rather than refusing, because the intent is not ambiguous. Someone
 * who offers ₪500 of wallet against a ₪50 order wants the order paid from the
 * wallet; the most they can spend is ₪50, and that is what they get.
 */

/** Two decimals, the same precision as the `step` and as the server's toFixed(2). */
function toAgorotPrecision(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * @param raw the field's value, exactly as typed
 * @param maxIls min(wallet balance, on-site charge), in shekels
 * @returns the clamped value, or '' when the field is empty and should stay so
 */
export function clampWalletIls(raw: string, maxIls: number): string {
  if (raw.trim() === '') return ''
  const parsed = Number(raw)
  // A number input can still hold an unparseable string ('e', '1-2'); the
  // browser reports those as '' but a paste into a text field would not.
  if (!Number.isFinite(parsed)) return ''
  const ceiling = Math.max(0, toAgorotPrecision(maxIls))
  const clamped = Math.min(Math.max(0, toAgorotPrecision(parsed)), ceiling)
  return String(clamped)
}
