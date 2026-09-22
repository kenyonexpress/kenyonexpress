import StatusBadge from '@/components/admin/StatusBadge'
import { requireSection } from '@/lib/admin/rbac'
import { formatDateTime } from '@/lib/i18n/format'
import { createAdminClient } from '@/lib/supabase/admin'
import { listRecentWhatsAppMessages } from '@/server/queries/whatsapp-messages'
import Link from 'next/link'

export const metadata = { title: 'הודעות וואטסאפ' }

/**
 * Every inbound WhatsApp conversation, newest first.
 *
 * Gated on the `orders` section, the same choice `/admin/support` already
 * made: this is the same support/admin audience reading the same customer
 * conversations, one channel over.
 *
 * READ-ONLY. The reply already went out synchronously from
 * `src/app/api/webhooks/whatsapp/route.ts` at the moment the message arrived
 * -- an opt-in/opt-out confirmation, a ticket acknowledgment, or an order
 * summary when `findRecentOrderForPhone` matched one (238). This page is the
 * record of that, not a console to act from; acting on the ticket happens on
 * `/admin/support`, which this links to only by its short reference because
 * there is no per-ticket route yet.
 */

const INTENT_BADGE: Record<string, { label: string; variant: 'green' | 'blue' | 'red' | 'gray' }> =
  {
    message: { label: 'פנייה', variant: 'blue' },
    opt_in: { label: 'הצטרפות', variant: 'green' },
    opt_out: { label: 'הסרה', variant: 'red' },
  }

function intentBadge(intent: string) {
  return INTENT_BADGE[intent] ?? { label: intent, variant: 'gray' as const }
}

function shortRef(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export default async function WhatsAppMessagesPage() {
  await requireSection('orders', 'read')

  const admin = createAdminClient()
  const messages = await listRecentWhatsAppMessages(admin)

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">הודעות וואטסאפ</h1>
        <p className="mt-1 text-sm text-gray-600">
          כל הודעה נכנסת דרך <code>webhooks/whatsapp</code>, כולל הצטרפות/הסרה מרשימת התפוצה ופניות
          חופשיות. פנייה חופשית פותחת או מצטרפת לפנייה ב
          <Link href="/admin/support" className="underline">
            פניות תמיכה
          </Link>
          , ואם המספר זוהה כשייך להזמנה קיימת -- סיכום ההזמנה נשלח חזרה אוטומטית.
        </p>
      </header>

      {messages.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          עוד לא התקבלה אף הודעה.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 text-start font-medium">מתי</th>
                <th className="p-3 text-start font-medium">מספר</th>
                <th className="p-3 text-start font-medium">סוג</th>
                <th className="p-3 text-start font-medium">תוכן</th>
                <th className="p-3 text-start font-medium">פנייה</th>
                <th className="p-3 text-start font-medium">הזמנה שזוהתה</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => {
                const badge = intentBadge(message.intent)
                return (
                  <tr key={message.message_sid} className="border-t">
                    <td className="p-3 text-gray-500">{formatDateTime(message.created_at)}</td>
                    <td className="p-3" dir="ltr">
                      {message.phone}
                    </td>
                    <td className="p-3">
                      <StatusBadge label={badge.label} variant={badge.variant} />
                    </td>
                    <td className="p-3 max-w-xs truncate" title={message.body}>
                      {message.body || '—'}
                    </td>
                    <td className="p-3 text-gray-500">
                      {message.ticket_id ? shortRef(message.ticket_id) : '—'}
                    </td>
                    <td className="p-3">
                      {message.order_id ? (
                        <Link href={`/admin/orders/${message.order_id}`} className="underline">
                          {shortRef(message.order_id)}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
