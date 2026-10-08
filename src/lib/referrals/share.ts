import { type ReferralShareChannel, referralShareUrl } from '@/lib/referrals/code'

/**
 * The message a referrer sends, and the link inside it.
 *
 * ONE BUILDER FOR EVERY CHANNEL. WhatsApp, the native share sheet and the copy
 * button all put the same sentence in front of the friend, so the promise the
 * friend reads is the one the page already read from
 * `referral_program_settings`. The bonus arrives here as a formatted label and
 * not as a number, because this module must never be the place a sum is
 * decided: the database pays what its row says, the page formats that row,
 * and this only repeats it.
 *
 * The friend's clause is conditional for the same reason the page's is: when
 * the programme pays the friend nothing, the message does not promise them
 * anything.
 */
export function referralShareText(input: {
  code: string
  origin: string
  channel: ReferralShareChannel
  /** The friend's bonus, already formatted (e.g. "₪10"), or null when it is zero. */
  friendBonusLabel: string | null
  /** The minimum first order, already formatted. */
  minOrderLabel: string
}): { url: string; text: string } {
  const url = referralShareUrl(input.code, input.origin, input.channel)
  const promise = input.friendBonusLabel
    ? `מקבלים ${input.friendBonusLabel} קאשבק על הקנייה הראשונה מ-${input.minOrderLabel}.`
    : 'ההצטרפות דרך הקישור שלי.'
  const text = `היי! הנה הקישור האישי שלי לקניון Express. ${promise}\n${url}`
  return { url, text }
}
