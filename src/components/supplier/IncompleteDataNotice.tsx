import type { SupplierRead } from '@/server/queries/supplier'

/**
 * The banner that goes above any total folded from a read that did not finish.
 *
 * Every money figure in this console is a sum over an array (see the header of
 * `server/queries/supplier.ts`). Two things can make that array not be the whole
 * set -- the read hit its ceiling, or the read errored and returned nothing --
 * and in both cases the fold still produces a clean-looking number. The number
 * is the problem: `₪0` from a failed query is indistinguishable from `₪0` from
 * a shop with no sales, and a receivable summed over a truncated page looks
 * exactly like a complete one.
 *
 * So the pages render this instead of quietly printing the total. It says which
 * of the two happened, because they need different actions: a truncated read is
 * "ask us for the full export", a failed one is "this is broken, try again".
 */
export default function IncompleteDataNotice({
  reads,
}: {
  reads: readonly Pick<SupplierRead<unknown>, 'truncated' | 'failed'>[]
}) {
  const failed = reads.some((read) => read.failed)
  const truncated = reads.some((read) => read.truncated)
  if (!failed && !truncated) return null

  // Failure outranks truncation: if a read errored, the numbers on the page are
  // not partial, they are absent, and saying "partial" would overstate them.
  return (
    <output
      className={`block rounded-xl px-4 py-3 text-sm ${
        failed ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'
      }`}
    >
      {failed
        ? 'לא הצלחנו לטעון את הנתונים כרגע, והמספרים בעמוד אינם מייצגים. רעננו את העמוד, ואם זה חוזר פנו אלינו.'
        : 'יש יותר רשומות ממה שהעמוד מציג, והסכומים כאן חלקיים. לקבלת הפירוט המלא פנו אלינו.'}
    </output>
  )
}
