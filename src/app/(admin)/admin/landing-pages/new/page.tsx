import LandingPageForm from '@/components/admin/LandingPageForm'
import { requireSection } from '@/lib/admin/rbac'

export const metadata = { title: 'דף נחיתה חדש' }

export default async function NewLandingPagePage() {
  await requireSection('catalog', 'write')
  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">דף נחיתה חדש</h1>
        <p className="mt-1 text-sm text-gray-600">
          נשמר כטיוטה עד שתפרסמו. הדף זמין לתצוגה מקדימה לצוות בכל מצב.
        </p>
      </header>
      <LandingPageForm />
    </div>
  )
}
