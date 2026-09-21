import StatusBadge from '@/components/admin/StatusBadge'
import { requireAdminSession } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import SupplierRequestActions from '../SupplierRequestActions'

export const metadata = { title: 'תמונות מספקים לאישור' }

/** PostgREST's schema-cache miss, and Postgres' undefined_table. 232 is pending. */
const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])
/** Long enough to look, short enough that a copied link dies with the tab. */
const PREVIEW_TTL_SECONDS = 600

type Row = {
  id: string
  supplier_id: string
  kind: string
  product_id: string | null
  storage_bucket: string
  storage_path: string
  mime_type: string
  byte_size: number
  alt_he: string
  created_at: string | null
  suppliers: { name: string | null } | null
  products: { name_he: string | null } | null
}

/**
 * The decision half of section 54's uploads. The preview is a SIGNED URL
 * into the private pending bucket, minted here with the service role for this
 * render only; nothing in the pending bucket has a public address, which is
 * the whole point of the bucket.
 */
export default async function SupplierImageSubmissionsPage() {
  await requireAdminSession()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('supplier_image_submissions' as never)
    .select(
      'id, supplier_id, kind, product_id, storage_bucket, storage_path, mime_type, byte_size, alt_he, created_at, suppliers(name), products(name_he)',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200)
  const notApplied = Boolean(error) && TABLE_ABSENT.has(error?.code ?? '')
  const rows = (data ?? []) as unknown as Row[]

  const previews = new Map<string, string>()
  await Promise.all(
    rows.map(async (row) => {
      const { data: signed, error: signError } = await admin.storage
        .from(row.storage_bucket)
        .createSignedUrl(row.storage_path, PREVIEW_TTL_SECONDS)
      // No preview is shown as "no preview", and the reason is in the log
      // rather than swallowed: an object that cannot be signed is usually one
      // that is gone, and the row should be rejected, not admired.
      if (signError) {
        log.warn('admin.image_submission_preview_failed', {
          submissionId: row.id,
          reason: signError.message,
        })
      }
      if (signed?.signedUrl) previews.set(row.id, signed.signedUrl)
    }),
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">תמונות מספקים לאישור</h1>
        <StatusBadge label={`${rows.length} ממתינות`} variant={rows.length ? 'yellow' : 'green'} />
      </div>
      <p className="text-sm text-gray-500">
        קבצים שספקים העלו יושבים בדלי פרטי שאין לו כתובת ציבורית. אישור מפענח את הקובץ, מעתיק אותו
        לדלי הציבורי ומצרף אותו למוצר או קובע אותו כלוגו. דחייה מוחקת את הקובץ הממתין.
      </p>
      {notApplied ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          המיגרציה ‏232 עדיין לא הוחלה, ולכן אין טבלת העלאות ואין דלי ממתין. עד שתוחל, ספקים אינם
          יכולים להעלות והמסך הזה יישאר ריק.
        </p>
      ) : null}
      {error && !notApplied ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">טעינת ההעלאות נכשלה.</p>
      ) : null}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((row) => {
          const preview = previews.get(row.id)
          const target = row.kind === 'logo' ? 'לוגו העסק' : (row.products?.name_he ?? 'מוצר')
          return (
            <li key={row.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex gap-4">
                <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {preview ? (
                    // A signed URL to a private bucket: next/image would cache a
                    // link that expires in ten minutes.
                    <img src={preview} alt={row.alt_he} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400">
                      אין תצוגה
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="font-semibold text-gray-900">{target}</p>
                  <p className="text-gray-700">{row.alt_he}</p>
                  <p className="text-xs text-gray-500">
                    <Link
                      href={`/admin/suppliers/${row.supplier_id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.suppliers?.name ?? 'ספק'}
                    </Link>
                    {' · '}
                    <span dir="ltr">
                      {row.mime_type}, {Math.round(row.byte_size / 1024)}KB
                    </span>
                    {' · '}
                    {row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : '—'}
                  </p>
                  <div className="pt-2">
                    <SupplierRequestActions id={row.id} kind="image" label={target} />
                  </div>
                </div>
              </div>
            </li>
          )
        })}
        {rows.length === 0 && !error ? (
          <li className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-10 text-center text-gray-400 md:col-span-2">
            אין העלאות ממתינות
          </li>
        ) : null}
      </ul>
    </div>
  )
}
