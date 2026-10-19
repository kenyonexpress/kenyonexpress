import { supplierReadiness } from '@/lib/admin/supplier-form'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import ProfileForm from './ProfileForm'

export const metadata = { title: 'פרטי העסק' }

/**
 * The supplier's own details, which until now only an admin could change.
 *
 * Read with the service role for the same reason the write is: `suppliers` is
 * publicly SELECTable, so a user-scoped read would work, but the page and the
 * action must agree about which row and which columns exist, and one client
 * that both reads and writes is one place for that to be true.
 *
 * PAYMENT DETAILS ARE NOT ON THIS PAGE, and the note at the foot says so in
 * Hebrew rather than leaving a supplier hunting for a field that does not
 * exist. `suppliers` carries no bank column of any kind (measured against
 * production 2026-09-07) and there is no payout run to feed: a physical order
 * settles in the same run as the charge, and a coupon owes the supplier nothing
 * because the customer pays them the balance in cash at the counter.
 */
export default async function SupplierProfilePage() {
  const session = await requireSupplierRole('owner', '/supplier/profile')
  const admin = createAdminClient()

  const { data: supplier, error } = await admin
    .from('suppliers')
    .select(
      'name, contact_name, contact_email, contact_phone, whatsapp, address, city, website, logo_url, status',
    )
    .eq('id', session.supplierId)
    .maybeSingle()

  // A read that failed is not a supplier with empty details: rendering blank
  // inputs over an unreadable row invites an owner to "fix" it by saving
  // nothing over everything.
  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-heading">פרטי העסק</h1>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          לא הצלחנו לטעון את פרטי העסק. רעננו את הדף, ואם זה חוזר פנו אלינו.
        </p>
      </div>
    )
  }

  const readiness = supplierReadiness({
    name: supplier?.name,
    contact_phone: supplier?.contact_phone,
    address: supplier?.address,
    logo_url: supplier?.logo_url,
    status: supplier?.status,
  })

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-heading">פרטי העסק</h1>
        <p className="mt-1 text-sm text-gray-500">
          הפרטים שמופיעים ללקוחות בעמוד המוצר ובעמוד העסק. שם העסק ומספר ח.פ נקבעים מולנו ולא נערכים
          כאן.
        </p>
      </section>

      <ProfileForm
        values={{
          contact_name: supplier?.contact_name ?? '',
          contact_email: supplier?.contact_email ?? '',
          contact_phone: supplier?.contact_phone ?? '',
          whatsapp: supplier?.whatsapp ?? '',
          address: supplier?.address ?? '',
          city: supplier?.city ?? '',
          website: supplier?.website ?? '',
          logo_url: supplier?.logo_url ?? '',
        }}
        missingLabels={readiness.missingLabels}
      />

      <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-500">
        פרטי בנק אינם נאספים כאן ואין צורך בהם: במוצר פיזי ההתחשבנות מתבצעת באותו מחזור של החיוב,
        ובקופון הלקוח משלם לכם את היתרה במזומן בקופה בזמן הסריקה. תנאי ההתחשבנות עצמם נקבעים מולנו.
      </p>
    </div>
  )
}
