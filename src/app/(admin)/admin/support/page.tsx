import TicketConsoleRow from '@/components/admin/TicketConsoleRow'
import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { SLA_TARGETS, slaState } from '@/server/domain/support/sla'
import { NOT_APPLIED, listOpenTickets, listTicketMessages } from '@/server/queries/support'

export const metadata = { title: 'פניות תמיכה' }

/**
 * The ticket console.
 *
 * `orders`, NOT `payments`, and that is the one access decision on this page:
 * support has read on orders and this console is what the role exists for.
 * Fraud and disputes stayed on `payments` for the opposite reason.
 *
 * THE SLA IS COMPUTED HERE, ON EVERY LOAD, from `created_at` and
 * `first_response_at`. Nothing is stored, so re-tuning a target in
 * `SLA_TARGETS` corrects the whole queue at once instead of leaving every
 * existing row measured against a promise nobody makes any more.
 *
 * THE MESSAGES ARE LOADED FOR EVERY OPEN TICKET, and that is a deliberate cost.
 * A support queue where reading a ticket is a navigation is a queue where
 * operators answer from the subject line. The bound is the 200-row cap on the
 * queue itself, and the queue holding 200 open tickets is a different problem.
 */
export default async function SupportPage() {
  await requireSection('orders', 'read')

  const admin = createAdminClient()
  const tickets = await listOpenTickets(admin)

  if (tickets === NOT_APPLIED) {
    return (
      <div dir="rtl" className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">פניות תמיכה</h1>
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          העמודות שהקונסולה הזו קוראת עדיין לא הוחלו. הקובץ ממתין ב-
          <code>migrations/pending/203_support_center.sql</code>, ואומת מול פרודקשן בתוך בלוק
          שהתגלגל אחורה. הטבלאות עצמן כן קיימות ומחזיקות אפס שורות.
        </p>
      </div>
    )
  }

  const now = new Date()
  const withSla = await Promise.all(
    tickets.map(async (ticket) => ({
      ticket,
      sla: slaState({
        createdAt: ticket.created_at,
        firstResponseAt: ticket.first_response_at,
        status: ticket.status,
        priority: ticket.priority,
        now,
      }),
      // `true`: an operator sees the internal notes. That is what they are for.
      messages: await listTicketMessages(admin, ticket.id, true),
    })),
  )

  const breached = withSla.filter((entry) => entry.sla.breached)
  const unanswered = withSla.filter((entry) => entry.ticket.first_response_at === null)

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">פניות תמיכה</h1>
        <p className="mt-1 text-sm text-gray-600">
          זמני התגובה נגזרים מ-<code>SLA_TARGETS</code> בכל טעינה ואינם נשמרים בשורה, כדי ששינוי יעד
          יתקן את כל התור ולא ישאיר שורות שנמדדות מול הבטחה שכבר לא קיימת. השעון{' '}
          <strong>נעצר</strong> כשהפנייה ממתינה לתשובת הלקוח.
        </p>
      </header>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg bg-gray-100 px-3 py-1">
          פתוחות: <bdi>{withSla.length}</bdi>
        </span>
        <span className="rounded-lg bg-amber-100 px-3 py-1">
          עוד לא נענו: <bdi>{unanswered.length}</bdi>
        </span>
        <span
          className={`rounded-lg px-3 py-1 ${breached.length > 0 ? 'bg-red-100 font-semibold text-red-900' : 'bg-gray-100'}`}
        >
          חריגה מ-SLA: <bdi>{breached.length}</bdi>
        </span>
        <span className="rounded-lg bg-gray-100 px-3 py-1">
          יעד תגובה ראשונה לפנייה דחופה: <bdi>{SLA_TARGETS.urgent.firstResponseHours}</bdi> שעות
        </span>
      </div>

      {withSla.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          אין פניות פתוחות.
        </p>
      ) : (
        <ul className="space-y-4">
          {withSla.map((entry) => (
            <TicketConsoleRow
              key={entry.ticket.id}
              id={entry.ticket.id}
              subject={entry.ticket.subject}
              status={entry.ticket.status}
              priority={entry.ticket.priority}
              channel={entry.ticket.channel}
              category={entry.ticket.category}
              createdAt={entry.ticket.created_at}
              orderId={entry.ticket.order_id}
              contact={entry.ticket.email ?? entry.ticket.phone}
              answered={entry.ticket.first_response_at !== null}
              breached={entry.sla.breached}
              paused={entry.sla.paused}
              minutesToFirstResponse={entry.sla.minutesToFirstResponse}
              messages={entry.messages.map((message) => ({
                id: message.id,
                direction: message.direction,
                body: message.body,
                at: message.created_at,
              }))}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
