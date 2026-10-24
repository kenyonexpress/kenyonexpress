import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { setMaintenanceMode } from '@/server/actions/admin/feature-flags'

export const metadata = { title: 'הגדרות' }

/**
 * Site-wide settings. Today that is the maintenance switch
 * (feature_flags.maintenance_mode); the proxy sends storefront visitors to
 * /maintenance within 30 seconds of a flip.
 */
export default async function AdminSettingsPage() {
  await requireSection('analytics')
  const { data, error } = await createAdminClient()
    .from('feature_flags' as never)
    .select('bool_value')
    .eq('key', 'maintenance_mode')
    .maybeSingle()
  // Showing OFF because the read failed would invite a contradictory click.
  if (error) throw new Error(`feature_flags read failed: ${error.message}`)
  const on = (data as { bool_value?: boolean } | null)?.bool_value === true

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">הגדרות</h1>
      </header>
      <form
        action={setMaintenanceMode}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"
      >
        <div>
          <h2 className="font-semibold text-gray-900">מצב תחזוקה</h2>
          <p className="text-sm text-gray-600">
            כרגע: <strong>{on ? 'פעיל, החנות סגורה ללקוחות' : 'כבוי'}</strong>. ניהול, תשלומים,
            וובהוקים וקרונים ממשיכים לעבוד. השינוי חל תוך 30 שניות.
          </p>
        </div>
        <input type="hidden" name="return_to" value="/admin/settings" />
        <input type="hidden" name="maintenance_mode" value={on ? 'off' : 'on'} />
        <button
          type="submit"
          aria-label={on ? 'פתיחת האתר' : 'הפעלת מצב תחזוקה'}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${on ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
        >
          {on ? 'פתיחת האתר' : 'הפעלת מצב תחזוקה'}
        </button>
      </form>
    </div>
  )
}
