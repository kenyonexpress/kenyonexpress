import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { STATUS_LABELS, type TicketStatus } from '@/server/domain/support/sla'
import { NOT_APPLIED, listUserTickets } from '@/server/queries/support'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const metadata = { title: 'הפניות שלי' }

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'וואטסאפ',
  contact_form: 'טופס צור קשר',
  email: 'מייל',
  order_help: 'עזרה בהזמנה',
  return_request: 'בקשת החזרה',
}

export default async function TicketsPage() {
  // The (account) layout already redirects a signed-out visitor, so this is a
  // read of a user that is guaranteed to exist rather than a second guard.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/account/tickets')}`)

  const admin = createAdminClient()
  const tickets = await listUserTickets(admin, user.id)

  if (tickets === NOT_APPLIED) {
    return (
      <>
        <h1 className="account-title">הפניות שלי</h1>
        <p className="account-note">
          מרכז הפניות עדיין לא פעיל. אפשר לפנות אלינו דרך טופס{' '}
          <Link href="/contact" className="underline">
            צור קשר
          </Link>
          .
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="account-title">הפניות שלי</h1>

      {tickets.length === 0 ? (
        <p className="account-note">
          אין לכם פניות פתוחות. אם משהו לא ברור, אפשר להתחיל{' '}
          <Link href="/help" className="underline">
            במרכז העזרה
          </Link>
          .
        </p>
      ) : (
        <ul className="account-list">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="account-row">
              <div className="account-row__main">
                <Link href={`/account/tickets/${ticket.id}`} className="underline">
                  {ticket.subject ?? 'פנייה'}
                </Link>
                <span className="account-row__meta">
                  {CHANNEL_LABELS[ticket.channel] ?? ticket.channel} ·{' '}
                  {new Date(ticket.created_at).toLocaleDateString('he-IL')}
                </span>
              </div>
              <div className="account-row__actions">
                {STATUS_LABELS[ticket.status as TicketStatus] ?? ticket.status}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
