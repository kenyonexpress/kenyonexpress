'use client'

import { type SupportActionState, replyAsStaff, updateTicket } from '@/server/actions/admin/support'
import { CANNED_REPLIES } from '@/server/domain/support/canned-replies'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TicketPriority,
  type TicketStatus,
} from '@/server/domain/support/sla'
import Link from 'next/link'
import { useActionState, useId, useState } from 'react'

const EMPTY: SupportActionState = null

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'וואטסאפ',
  contact_form: 'צור קשר',
  email: 'מייל',
  order_help: 'עזרה בהזמנה',
  return_request: 'בקשת החזרה',
}

const CATEGORY_LABELS: Record<string, string> = {
  order_status: 'מצב הזמנה',
  voucher_problem: 'בעיה בשובר',
  refund: 'החזר',
  payment: 'תשלום',
  account: 'חשבון',
  supplier: 'ספק',
  other: 'אחר',
}

/**
 * One ticket in the console: the conversation, a reply box, and the two
 * controls that move it.
 *
 * THE CANNED REPLY FILLS THE BOX AND DOES NOT SEND. An auto-reply that fires on
 * a category is a machine answering a question it did not read, and the only
 * thing worse than a slow answer is a confident wrong one. Picking one is a
 * starting point the operator edits.
 *
 * THE INTERNAL-NOTE BUTTON IS A SEPARATE SUBMIT, not a checkbox next to "send".
 * A checkbox that changes who can read the text is exactly the control that
 * gets missed, and the failure is a private note about a customer sent to that
 * customer. Two buttons, each saying what it does.
 */
export default function TicketConsoleRow(props: {
  id: string
  subject: string | null
  status: TicketStatus
  priority: TicketPriority
  channel: string
  category: string | null
  createdAt: string
  orderId: string | null
  contact: string | null
  answered: boolean
  breached: boolean
  paused: boolean
  minutesToFirstResponse: number | null
  messages: Array<{ id: string; direction: string; body: string; at: string }>
}) {
  const [replyState, replyAction, replyPending] = useActionState(replyAsStaff, EMPTY)
  const [updateState, updateAction, updatePending] = useActionState(updateTicket, EMPTY)
  const [body, setBody] = useState('')
  const baseId = useId()

  const overdueBy =
    props.minutesToFirstResponse !== null && props.minutesToFirstResponse < 0
      ? Math.abs(Math.round(props.minutesToFirstResponse / 60))
      : null

  return (
    <li
      className={`rounded-lg border p-4 ${props.breached ? 'border-red-300 bg-red-50' : 'bg-white'}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{props.subject ?? 'פנייה'}</span>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-sm">
          {PRIORITY_LABELS[props.priority] ?? props.priority}
        </span>
        <span className="text-sm">{STATUS_LABELS[props.status] ?? props.status}</span>
        <span className="text-sm text-gray-600">
          {CHANNEL_LABELS[props.channel] ?? props.channel}
          {props.category ? ` · ${CATEGORY_LABELS[props.category] ?? props.category}` : ''}
        </span>
        {props.orderId && (
          <Link href={`/admin/orders/${props.orderId}`} className="text-sm underline">
            ההזמנה
          </Link>
        )}
        {props.contact && <span className="text-sm text-gray-600">{props.contact}</span>}
      </div>

      <p
        className={`mt-1 text-sm ${props.breached ? 'font-semibold text-red-800' : 'text-gray-600'}`}
      >
        נפתחה {new Date(props.createdAt).toLocaleString('he-IL')}.{' '}
        {props.paused
          ? 'השעון עצור: ממתינה לתשובת הלקוח.'
          : props.answered
            ? props.breached
              ? 'התגובה הראשונה ניתנה אחרי היעד.'
              : 'נענתה בזמן.'
            : overdueBy !== null
              ? `עוד לא נענתה, ${overdueBy} שעות מעבר ליעד.`
              : `עוד לא נענתה, נותרו ${Math.round((props.minutesToFirstResponse ?? 0) / 60)} שעות.`}
      </p>

      <ol className="mt-3 space-y-2">
        {props.messages.map((message) => (
          <li
            key={message.id}
            className={`rounded p-2 text-sm ${
              message.direction === 'internal'
                ? 'bg-yellow-50'
                : message.direction === 'outbound'
                  ? 'bg-blue-50'
                  : 'bg-gray-50'
            }`}
          >
            <span className="text-xs text-gray-500">
              {message.direction === 'internal'
                ? 'הערה פנימית (הלקוח לא רואה)'
                : message.direction === 'outbound'
                  ? 'אנחנו'
                  : 'הלקוח'}{' '}
              · {new Date(message.at).toLocaleString('he-IL')}
            </span>
            <p className="whitespace-pre-wrap">{message.body}</p>
          </li>
        ))}
      </ol>

      <form action={replyAction} className="mt-3 space-y-2">
        <input type="hidden" name="ticket_id" value={props.id} />

        <label htmlFor={`${baseId}-canned`} className="block text-sm font-medium">
          תשובה מוכנה (ממלאת את התיבה, לא שולחת)
        </label>
        <select
          id={`${baseId}-canned`}
          className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
          defaultValue=""
          onChange={(event) => {
            const reply = CANNED_REPLIES.find((candidate) => candidate.id === event.target.value)
            if (reply) setBody(reply.body)
          }}
        >
          <option value="">בחירה</option>
          {CANNED_REPLIES.map((reply) => (
            <option key={reply.id} value={reply.id}>
              {reply.label}
            </option>
          ))}
        </select>

        <textarea
          name="body"
          required
          minLength={2}
          maxLength={4000}
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="direction"
            value="outbound"
            disabled={replyPending}
            className="min-h-11 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            שליחה ללקוח
          </button>
          <button
            type="submit"
            name="direction"
            value="internal"
            disabled={replyPending}
            className="min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60"
          >
            שמירה כהערה פנימית
          </button>
        </div>

        {replyState && 'error' in replyState && (
          <p role="alert" className="text-sm text-red-700">
            {replyState.error}
          </p>
        )}
        {replyState && 'success' in replyState && (
          <output className="text-sm text-green-700">{replyState.success}</output>
        )}
      </form>

      <form action={updateAction} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="ticket_id" value={props.id} />
        <select
          name="priority"
          defaultValue=""
          className="min-h-11 rounded-lg border px-3 py-2 text-sm"
          aria-label="דחיפות"
        >
          <option value="">דחיפות ללא שינוי</option>
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue=""
          className="min-h-11 rounded-lg border px-3 py-2 text-sm"
          aria-label="מצב"
        >
          <option value="">מצב ללא שינוי</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="assign_to_me" /> שייך אליי
        </label>
        <button
          type="submit"
          disabled={updatePending}
          className="min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          עדכון
        </button>
        {updateState && 'error' in updateState && (
          <p role="alert" className="text-sm text-red-700">
            {updateState.error}
          </p>
        )}
      </form>
    </li>
  )
}
