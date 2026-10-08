/**
 * The six services /admin/health shows as cards (STEP 67), in the order the
 * brief names them. `name` is the check's stable name in `checks.ts`; a
 * service listed here that the report does not contain renders as down, so
 * renaming a check without updating this list is visible, not silent.
 *
 * A plain module, not an export of the page: Next validates a page module's
 * exports, and the page test wants to read this list without rendering.
 */
export type PrimaryService = { name: string; title: string; vendor: string }

export const PRIMARY_SERVICES: readonly PrimaryService[] = [
  { name: 'database', title: 'בסיס הנתונים', vendor: 'Supabase Postgres' },
  { name: 'storage', title: 'אחסון קבצים', vendor: 'Cloudflare R2' },
  { name: 'search', title: 'חיפוש', vendor: 'Meilisearch' },
  { name: 'email', title: 'דואר יוצא', vendor: 'Resend' },
  { name: 'twilio', title: 'הודעות', vendor: 'Twilio (WhatsApp / SMS)' },
  { name: 'cardcom', title: 'סליקה', vendor: 'Cardcom' },
]
