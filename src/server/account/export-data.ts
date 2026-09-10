import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Everything one signed-in person's account holds, assembled for them.
 *
 * This is the right of access: GDPR article 15 and, for this business, section
 * 13 of the Israeli Privacy Protection Law. The obligation is to hand over the
 * data, not to hand over a schema dump, so the shape here follows the account
 * area a customer already understands rather than the table layout.
 *
 * READ THROUGH THE USER'S OWN CLIENT, NEVER THE ADMIN CLIENT, and that is the
 * whole security design. Every query below is scoped by RLS to the caller, so
 * the export cannot return somebody else's row even if a filter is wrong or a
 * column is renamed. Assembling this with the service-role key and a
 * `.eq('user_id', me)` would put the entire customer base one typo away from
 * the wrong inbox, and that typo would be invisible in review.
 *
 * A TABLE THAT REFUSES IS REPORTED, NOT DROPPED. Not every table carries an
 * owner-select policy, and one that does not must show up in the output as a
 * named omission. Silently returning `[]` for it would tell the customer they
 * have no reviews when what happened is that we could not read them, and an
 * export that under-reports is a worse compliance answer than one that says so.
 */

export type ExportSection = {
  /** The table it came from, so a reader can ask a follow-up question. */
  source: string
  rows: unknown[]
  /** Present only when the read failed. `rows` is then empty and not trusted. */
  unavailable?: string
}

export type AccountExport = {
  generated_at: string
  user_id: string
  /**
   * Named in the file so the person reading it knows what they are looking at
   * and, more usefully, what is NOT here: anything the platform holds about
   * them that is not owned by their account row.
   */
  notes: string[]
  sections: Record<string, ExportSection>
}

type MinimalClient = Pick<SupabaseClient, 'from'>

/**
 * What to read, and how the caller's id reaches it.
 *
 * The owner column differs per table because these tables were written over
 * months by different migrations: `profiles` keys on `id`, most key on
 * `user_id`, and the card vault keys on `profile_id`. Getting one wrong is not
 * a leak - RLS still scopes the read - it is an empty section, which is why
 * every one of them is named here rather than derived.
 */
const TABLES: { section: string; table: string; owner: string; columns: string }[] = [
  { section: 'profile', table: 'profiles', owner: 'id', columns: '*' },
  { section: 'addresses', table: 'user_addresses', owner: 'user_id', columns: '*' },
  { section: 'orders', table: 'orders', owner: 'user_id', columns: '*' },
  { section: 'vouchers', table: 'vouchers', owner: 'user_id', columns: '*' },
  { section: 'reviews', table: 'reviews', owner: 'user_id', columns: '*' },
  { section: 'wishlist', table: 'wishlists', owner: 'user_id', columns: '*' },
  { section: 'wallet_transactions', table: 'wallet_transactions', owner: 'user_id', columns: '*' },
  /**
   * `referrer_user_id`, verified against production 2026-09-10, and NOT
   * `referrer_id`, which this line said first and which does not exist on the
   * table at all. The wrong name is not a leak - RLS still scopes the read -
   * it is a section that comes back empty forever while looking correct, which
   * is the failure this whole list is spelled out to prevent.
   *
   * Only referrals this person MADE. The row where they are `referred_user_id`
   * is somebody else's referral of them, and it carries that person's identity.
   */
  { section: 'referrals', table: 'referrals', owner: 'referrer_user_id', columns: '*' },
  { section: 'recent_searches', table: 'user_recent_searches', owner: 'user_id', columns: '*' },
  { section: 'support_tickets', table: 'support_tickets', owner: 'user_id', columns: '*' },
  /**
   * The saved-card vault, and the ONE section that is not `*`.
   *
   * `payment_tokens` holds the provider token that can be charged. A customer
   * asking what we know about them is owed the card's identity - brand, last
   * four, expiry - and must not be handed a bearer credential in a file they
   * will email to themselves, forward to a lawyer, or drop in a downloads
   * folder. The right of access is not a reason to widen the blast radius of
   * the export itself.
   */
  {
    section: 'saved_cards',
    table: 'payment_tokens',
    owner: 'profile_id',
    columns: 'id, brand, last4, expiry_month, expiry_year, is_default, created_at',
  },
]

const NOTES = [
  'הקובץ מכיל את הנתונים שהחשבון שלך מחזיק, נכון לרגע ההפקה.',
  'פרטי כרטיס אשראי מיוצאים ללא הטוקן שניתן לחייב בו: מותג, ארבע ספרות אחרונות ותוקף בלבד.',
  'הזמנות, תשלומים וחשבוניות נשמרים גם אחרי מחיקת חשבון, לפי חובת שמירת רשומות של שבע שנים.',
  'סעיף המסומן unavailable לא נקרא בהצלחה, ואין להסיק ממנו שאין לך נתונים מסוג זה.',
]

/**
 * Assembles the export. Never throws: a failure becomes a named `unavailable`
 * section, because a 500 here tells the customer nothing and tells us less.
 */
export async function buildAccountExport(
  supabase: MinimalClient,
  userId: string,
  now: Date = new Date(),
): Promise<AccountExport> {
  const sections: Record<string, ExportSection> = {}

  for (const spec of TABLES) {
    try {
      const { data, error } = await supabase
        .from(spec.table)
        .select(spec.columns)
        .eq(spec.owner, userId)

      sections[spec.section] = error
        ? { source: spec.table, rows: [], unavailable: error.message }
        : { source: spec.table, rows: (data as unknown[]) ?? [] }
    } catch (cause) {
      sections[spec.section] = {
        source: spec.table,
        rows: [],
        unavailable: cause instanceof Error ? cause.message : 'read threw',
      }
    }
  }

  return {
    generated_at: now.toISOString(),
    user_id: userId,
    notes: NOTES,
    sections,
  }
}

/**
 * `kenyonexpress-my-data-2026-09-10.json`.
 *
 * ASCII only, deliberately. `Content-Disposition` is a header, Hebrew in a
 * filename needs RFC 5987 encoding to survive it, and a mis-encoded filename is
 * how a download arrives named `ן¿½.json` or not at all.
 */
export function exportFilename(now: Date = new Date()): string {
  return `kenyonexpress-my-data-${now.toISOString().slice(0, 10)}.json`
}
