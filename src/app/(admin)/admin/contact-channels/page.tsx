import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { formatIsraeliPhoneDisplay, storeWhatsAppNumber } from '@/lib/whatsapp'
import { listContactChannelsForAdmin } from '@/server/contact/channels'
import { ContactChannelForm, PageContactConfigForm } from './ContactChannelForms'

export const metadata = { title: 'ערוצי וואטסאפ' }

/**
 * Section 94. Five topics and the route defaults, editable in place. Reads
 * through the same cached loader the storefront uses, so what the operator
 * sees is what a visitor gets within 30 seconds of saving.
 */
export default async function AdminContactChannelsPage() {
  const { role } = await requireSection('content')
  const canEdit = canWriteSection(role, 'content')
  const { channels, configs, source } = await listContactChannelsForAdmin()
  const storeNumber = formatIsraeliPhoneDisplay(storeWhatsAppNumber())

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">ערוצי וואטסאפ לפי נושא</h1>
        <p className="mt-1 text-sm text-gray-600">
          כל נושא פותח שיחה במספר שלו עם פתיח משלו. מספר ריק = מספר החנות ({storeNumber ?? '—'}).
          המקור כרגע: {source === 'table' ? 'הטבלה' : 'ברירות המחדל מהקוד (מיגרציה 236 ממתינה)'}.
        </p>
      </header>

      {source === 'defaults' && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          הטבלאות contact_channels ו-page_contact_config עדיין לא קיימות בבסיס הנתונים. שמירה תיכשל
          עם הודעה ברורה עד שמיגרציה 236 תוחל; החנות מציגה בינתיים את ברירות המחדל.
        </p>
      )}

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">נושאים</h2>
        <div className="hidden text-xs text-gray-500 md:grid md:grid-cols-[1fr_1.2fr_1fr_2fr_auto_auto_auto] md:gap-2">
          <span>מפתח</span>
          <span>שם</span>
          <span>מספר</span>
          <span>פתיח</span>
          <span>סדר</span>
          <span>פעיל</span>
          <span />
        </div>
        {channels.map((channel) => (
          <ContactChannelForm key={channel.key} channel={channel} readOnly={!canEdit} />
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">ברירת מחדל לפי עמוד</h2>
        <p className="text-xs text-gray-500">
          תבנית route ← הנושא שהעמוד פונה אליו ופתיח מותאם. {'{name}'} מוחלף בשם המוצר או בית העסק.
        </p>
        {configs.map((config) => (
          <PageContactConfigForm key={config.routeTemplate} config={config} readOnly={!canEdit} />
        ))}
      </section>
    </div>
  )
}
