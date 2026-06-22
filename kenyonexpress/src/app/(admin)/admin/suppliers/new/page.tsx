import VendorForm from '@/components/admin/VendorForm'

export const metadata = { title: 'ספק חדש' }

export default function NewVendorPage() {
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900">ספק חדש</h1>
      <p className="text-sm text-gray-500">
        שים לב: המשתמש חייב להיות קיים במערכת. ניתן לקשר profile_id לאחר יצירת הספק דרך לוח הבקרה.
      </p>
      <VendorForm />
    </div>
  )
}
