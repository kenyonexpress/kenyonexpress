import TicketThread from '@/components/account/TicketThread'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NOT_APPLIED, listTicketMessages, readTicket } from '@/server/queries/support'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

export const metadata = { title: 'פנייה' }

type Props = { params: Promise<{ id: string }> }

export default async function TicketPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/account/tickets/${id}`)}`)

  const admin = createAdminClient()
  const ticket = await readTicket(admin, id)
  if (ticket === NOT_APPLIED) notFound()
  // The service-role client does not consult RLS, so ownership is proven here.
  // A ticket that is not theirs is a 404 and never a "forbidden": the second
  // answer confirms the id exists.
  if (!ticket || ticket.user_id !== user.id) notFound()

  // `false`: internal notes are operator-to-operator and the customer never
  // sees them. Enforced here because this read is on the service-role client,
  // and again by the RLS policy 203 tightens for the direct-PostgREST path.
  const messages = await listTicketMessages(admin, id, false)

  return (
    <>
      <h1 className="account-title">{ticket.subject ?? 'פנייה'}</h1>

      <TicketThread
        ticketId={ticket.id}
        status={ticket.status}
        createdAt={ticket.created_at}
        orderId={ticket.order_id}
        messages={messages.map((message) => ({
          id: message.id,
          fromUs: message.direction === 'outbound',
          body: message.body,
          at: message.created_at,
        }))}
      />

      <p>
        <Link className="account-btn" href="/account/tickets">
          חזרה לפניות
        </Link>
      </p>
    </>
  )
}
