import { isIsraeliMobile, normalizeIsraeliPhone } from '@/lib/whatsapp'

/**
 * Which contact columns a supplier may ask to change, and what a valid value
 * for each one looks like.
 *
 * THIS IS THE SECOND LOCK, NOT THE ONLY ONE. `225_supplier_contact_requests.sql`
 * puts the identical list in a CHECK constraint on `field`, and that is the one
 * that actually holds if this module is ever bypassed. The list is here as well
 * because a request refused by the database arrives as a constraint violation
 * with no Hebrew in it, and the person filling in the form deserves a sentence
 * rather than a 500.
 *
 * WHAT IS ABSENT IS THE DESIGN. `name` is the storefront's display name and
 * sits in indexed URLs; `business_id` is the identity invoices are issued
 * against; `min_payout_ils`, `payout_hold_business_days` and `status` are the
 * payout terms. None of those is a contact detail, and a form that lets the
 * party being paid edit the terms of being paid is not an approval queue, it is
 * a delay.
 */

export const CONTACT_FIELDS = [
  'contact_name',
  'contact_email',
  'contact_phone',
  'whatsapp',
  'address',
  'city',
  'website',
] as const

export type ContactField = (typeof CONTACT_FIELDS)[number]

export function isContactField(raw: unknown): raw is ContactField {
  return typeof raw === 'string' && (CONTACT_FIELDS as readonly string[]).includes(raw)
}

export const CONTACT_FIELD_LABEL_HE: Record<ContactField, string> = {
  contact_name: 'איש קשר',
  contact_email: 'אימייל',
  contact_phone: 'טלפון',
  whatsapp: 'וואטסאפ',
  address: 'כתובת',
  city: 'עיר',
  website: 'אתר אינטרנט',
}

/** Mirrors the length ceiling in the migration's `c_len` CHECK. */
export const MAX_VALUE_LENGTH = 300
export const MAX_NOTE_LENGTH = 1000

export type FieldValidation = { ok: true; value: string } | { ok: false; error: string }

/**
 * A pragmatic address-shaped check rather than a full RFC 5322 parser.
 *
 * The value goes into `suppliers.contact_email`, which is where payout
 * correspondence is sent, so the cost of a typo is real -- but the thing that
 * catches a typo is a person reading the request in the approval queue, not a
 * regex. This rejects what is obviously not an address and lets the admin do
 * the rest, which is the division of labour the whole approval step exists for.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/**
 * Normalise and check one requested value.
 *
 * Every branch trims first. A trailing space in a phone number or an email is
 * invisible in the admin queue, survives approval, and then fails to match
 * anything downstream -- and the CSV formula guard in `lib/reports/csv.ts`
 * quotes leading/trailing whitespace precisely because it is otherwise
 * undetectable in a file.
 */
export function validateContactValue(field: ContactField, raw: string): FieldValidation {
  const value = raw.trim()

  if (value.length === 0) {
    // Clearing a field is not offered. An empty `contact_phone` is a business
    // nobody can reach about an order, and the request table cannot express the
    // difference between "make this blank" and "I left the box alone" -- the
    // migration's CHECK requires a non-empty `requested_value` for the same
    // reason. Removing a detail is a conversation with support.
    return { ok: false, error: 'יש למלא ערך. למחיקת פרט קיים פנו אלינו.' }
  }
  if (value.length > MAX_VALUE_LENGTH) {
    return { ok: false, error: `הערך ארוך מדי (עד ${MAX_VALUE_LENGTH} תווים).` }
  }

  switch (field) {
    case 'contact_email': {
      if (!EMAIL_SHAPE.test(value)) return { ok: false, error: 'כתובת אימייל לא תקינה.' }
      // Lower-cased because the domain half is case-insensitive and a supplier
      // typing `Info@Example.COM` should not create a second, different-looking
      // address in the admin queue next month.
      return { ok: true, value: value.toLowerCase() }
    }
    case 'contact_phone': {
      const normalized = normalizeIsraeliPhone(value)
      if (!normalized) return { ok: false, error: 'מספר טלפון לא תקין.' }
      // The number is stored AS TYPED, not normalised to `972...`. Israelis
      // read `03-1234567`, every existing row in this column is in local form,
      // and `lib/supplier-contact.ts` already normalises at the point it builds
      // a `tel:` or `wa.me` link. Rewriting it here would make the approval
      // queue show an admin a value the supplier did not ask for.
      return { ok: true, value }
    }
    case 'whatsapp': {
      // A landline cannot hold a WhatsApp account, and `buildSupplierContact`
      // documents that all five filled production rows keep a landline in
      // `contact_phone` and a mobile here. Accepting a landline would produce a
      // link that opens WhatsApp only to say the number is not on it.
      if (!isIsraeliMobile(value)) return { ok: false, error: 'יש להזין מספר נייד לוואטסאפ.' }
      return { ok: true, value }
    }
    case 'website': {
      // WHETHER THE VALUE ALREADY CARRIES A SCHEME IS DECIDED FIRST, AND NOT BY
      // LOOKING FOR `http`. Prefixing `https://` onto anything that merely does
      // not START with http is how `mailto:a@b.com` becomes
      // `https://mailto:a@b.com` -- which `new URL` parses happily as host
      // `b.com` with `mailto:a` as userinfo, passes a protocol check, passes a
      // dot-in-hostname check, and is stored. Rendered as an href it is a link
      // to somewhere the supplier did not type, in the shape every credential-
      // in-URL phishing link has. Caught by the test for this case, not
      // reasoned about in advance.
      const scheme = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
      if (scheme && !/^https?$/i.test(scheme[1] as string)) {
        return { ok: false, error: 'כתובת אתר חייבת להתחיל ב-http או https.' }
      }
      const candidate = scheme ? value : `https://${value}`
      if (candidate.length > MAX_VALUE_LENGTH) {
        return { ok: false, error: `הערך ארוך מדי (עד ${MAX_VALUE_LENGTH} תווים).` }
      }

      let parsed: URL
      try {
        parsed = new URL(candidate)
      } catch {
        return { ok: false, error: 'כתובת אתר לא תקינה.' }
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, error: 'כתובת אתר לא תקינה.' }
      }
      // Credentials in a URL are refused outright. `https://real.co.il@evil.com`
      // reads as the supplier's own domain and navigates to somebody else's,
      // and no legitimate business website address contains a `@`.
      if (parsed.username || parsed.password) {
        return { ok: false, error: 'כתובת אתר לא תקינה.' }
      }
      if (!parsed.hostname.includes('.')) return { ok: false, error: 'כתובת אתר לא תקינה.' }
      return { ok: true, value: candidate }
    }
    case 'contact_name':
    case 'address':
    case 'city':
      return { ok: true, value }
  }
}

/** Whether a requested change is actually a change. */
export function isSameValue(current: string | null | undefined, requested: string): boolean {
  return (current ?? '').trim() === requested.trim()
}
