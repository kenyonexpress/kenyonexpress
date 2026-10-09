/**
 * How many SMS a message actually is, which in Hebrew is not what anybody
 * guesses.
 *
 * THE ARITHMETIC EVERY SMS BUDGET GETS WRONG. An SMS is 160 characters only
 * when every character is in the GSM 03.38 alphabet, which is Latin plus a
 * handful of symbols. One character outside it -- one Hebrew letter, one
 * emoji, one curly apostrophe -- switches the WHOLE message to UCS-2, and a
 * UCS-2 message is 70 characters. Not 160.
 *
 * So a 140-character Hebrew notification is not "well under the limit". It is
 * THREE segments, billed as three messages, and a Hebrew SMS programme costs
 * between two and three times what a naive per-message estimate says.
 *
 * MULTIPART IS SMALLER STILL. A message that does not fit one segment is split
 * with a 6-byte User Data Header in each part, which costs 7 characters of
 * GSM-7 or 3 of UCS-2. So the boundaries are 160/153 and 70/67, and the second
 * number is the one that matters for everything this system sends.
 *
 * WHY IT IS COMPUTED BEFORE THE SEND AND NOT READ FROM THE RECEIPT. Twilio
 * reports `num_segments` after the fact, and after the fact is too late to
 * refuse: the money is spent. A template that grew by one word and silently
 * became a third segment is exactly the change nobody notices, which is why
 * `src/lib/sms/templates.test.ts` asserts a segment ceiling per template.
 *
 * SURROGATE PAIRS COUNT AS TWO. An emoji outside the BMP is two UTF-16 code
 * units on the wire, so `[...text].length` would undercount it. `text.length`
 * is the right measure here precisely because it is the UTF-16 one.
 */

/**
 * GSM 03.38, the basic set plus the extension table.
 *
 * The seven extension characters (`^{}\\[~]|€`) each cost TWO septets rather
 * than one, which is why they are counted separately below rather than being
 * folded into the basic set.
 */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

const GSM_EXTENDED = '^{}\\[~]|€'

const GSM_BASIC_SET = new Set(GSM_BASIC)
const GSM_EXTENDED_SET = new Set(GSM_EXTENDED)

export type SmsEncoding = 'GSM-7' | 'UCS-2'

export interface SmsSize {
  encoding: SmsEncoding
  /** Septets for GSM-7, UTF-16 code units for UCS-2. */
  units: number
  segments: number
}

/** GSM-7 only if EVERY character is in the alphabet. One Hebrew letter is enough. */
export function smsEncodingOf(text: string): SmsEncoding {
  for (const char of text) {
    if (!GSM_BASIC_SET.has(char) && !GSM_EXTENDED_SET.has(char)) return 'UCS-2'
  }
  return 'GSM-7'
}

export function measureSms(text: string): SmsSize {
  const encoding = smsEncodingOf(text)

  if (encoding === 'UCS-2') {
    // `.length` and not `[...text].length`: UTF-16 code units are what goes on
    // the wire, so an emoji outside the BMP correctly counts as two.
    const units = text.length
    const segments = units === 0 ? 1 : units <= 70 ? 1 : Math.ceil(units / 67)
    return { encoding, units, segments }
  }

  let units = 0
  for (const char of text) units += GSM_EXTENDED_SET.has(char) ? 2 : 1
  const segments = units === 0 ? 1 : units <= 160 ? 1 : Math.ceil(units / 153)
  return { encoding, units, segments }
}

/** The number of segments alone, for a cost estimate or a template assertion. */
export function smsSegments(text: string): number {
  return measureSms(text).segments
}
