/**
 * What a registration records when the customer ticks the terms box (UX24).
 *
 * WHERE IT LIVES TODAY. In `auth.users.raw_user_meta_data`, passed as
 * `options.data` to `signUp`, next to the name and phone the trigger already
 * reads: no schema change is needed for the record to exist, and GoTrue
 * stamps it in the same INSERT that creates the account, so there is no
 * account without the acceptance it was created under. Migration 272
 * (pending) mirrors the two fields onto `profiles` so the application can
 * read them without the service role, and backfills from the metadata.
 *
 * WHY THE VERSION AND NOT A BOOLEAN. The terms have a published history
 * (`_content/terms.ts`: 1.0 on 19.08, 1.1 on 08.10). "Accepted" with no
 * version says nothing once the text changes; "accepted 1.1 on this date"
 * answers the only question anybody ever asks about it.
 *
 * This module is CLIENT-SAFE on purpose: the register panel imports the
 * field name and the refusal sentence, and the legal documents (every
 * paragraph of the תקנון) must not ride into its chunk for that. The record
 * that reads their versions is `server/auth/terms-record.ts`.
 */
export const TERMS_ACCEPT_FIELD = 'accept_terms'

export const TERMS_NOT_ACCEPTED = 'כדי להירשם יש לאשר את תנאי השימוש ומדיניות הפרטיות'

/** The checkbox's serialised value, or nothing at all when it was not ticked. */
export function termsAccepted(value: FormDataEntryValue | null | undefined): boolean {
  return value === 'on' || value === '1' || value === 'true'
}
