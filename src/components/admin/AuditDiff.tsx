import { type AuditDiff, diffAuditChanges, summariseAuditDiff } from '@/lib/admin/audit-diff'

/**
 * The changed fields of one audit row, collapsed to a summary until asked.
 *
 * A `<details>` element rather than a client component with state: the audit
 * log is a server-rendered table and expanding a row needs no JavaScript at
 * all. It also stays open across a re-render and works with the keyboard for
 * free, both of which a hand-rolled toggle usually gets wrong.
 */

const KIND_LABEL: Record<'added' | 'removed' | 'changed', string> = {
  added: 'נוסף',
  removed: 'הוסר',
  changed: 'שונה',
}

const SHAPE_LABEL: Record<AuditDiff['shape'], string> = {
  create: 'נוצר',
  update: 'עודכן',
  delete: 'נמחק',
  unknown: 'לא ניתן לפענוח',
}

/** jsonb values are not all strings; render them without pretending they are. */
function render(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value === '' ? '(ריק)' : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export default function AuditDiffCell({ changes }: { changes: unknown }) {
  const diff = diffAuditChanges(changes)
  const summary = summariseAuditDiff(diff)

  if (diff.changes.length === 0) {
    return <span className="text-xs text-black/40">{summary}</span>
  }

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs text-black/70 hover:text-black">
        <span className="underline decoration-dotted underline-offset-2">{summary}</span>
        <span className="ms-1 text-black/40 group-open:hidden">▾</span>
        <span className="ms-1 hidden text-black/40 group-open:inline">▴</span>
      </summary>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs" dir="rtl">
          <thead>
            <tr className="text-black/50">
              <th className="p-1 text-start font-medium">שדה</th>
              <th className="p-1 text-start font-medium">לפני</th>
              <th className="p-1 text-start font-medium">אחרי</th>
            </tr>
          </thead>
          <tbody>
            {diff.changes.map((change) => (
              <tr key={change.field} className="border-t border-black/5 align-top">
                <td className="p-1 font-mono text-micro" dir="ltr">
                  {change.field}
                  <span className="ms-1 text-black/40">{KIND_LABEL[change.kind]}</span>
                </td>
                <td className="max-w-[18rem] break-words p-1 text-black/50 line-through">
                  {render(change.before)}
                </td>
                <td className="max-w-[18rem] break-words p-1 text-black">{render(change.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {diff.suppressed > 0 && (
          // Named, not hidden: a reader who counts the fields and gets a
          // different number should be able to see why.
          <p className="mt-1 text-micro text-black/35">
            {SHAPE_LABEL[diff.shape]} · {diff.suppressed} שדות תחזוקה הודחקו
          </p>
        )}
      </div>
    </details>
  )
}
