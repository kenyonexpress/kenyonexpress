'use client'

import { formatDate, formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { reorderFromOrder } from '@/server/actions/reorder'
import type { OrderSummary } from '@/server/queries/orders'
import { ChevronDownIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

interface OrderCardProps {
  order: OrderSummary
}

export default function OrderCard({ order }: OrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleReorder = async () => {
    setIsLoading(true)
    setMessage(null)
    try {
      const result = await reorderFromOrder(order.id)
      if (result.success) {
        setMessage({
          type: 'success',
          text: `${result.addedCount} ${result.addedCount > 1 ? 'פריטים נוספו' : 'פריט נוסף'} לעגלה`,
        })
      } else {
        setMessage({
          type: 'error',
          text: result.errors[0] || 'שגיאה בהוספת פריטים לעגלה',
        })
      }
    } catch (_err) {
      setMessage({
        type: 'error',
        text: 'שגיאה בהוספת פריטים לעגלה',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="account-row account-row--expandable">
        <button
          type="button"
          className="account-row__expand-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'סגור' : 'פתח'} הזמנה מתאריך ${formatDate(order.createdAt)}`}
        >
          <ChevronDownIcon
            className={`account-row__expand-icon ${isExpanded ? 'is-expanded' : ''}`}
            size={20}
            aria-hidden="true"
          />
        </button>

        <div className="account-row__main">
          <p className="account-row__title">
            {formatIls(order.totalAgorot)}{' '}
            <span
              className={`account-chip account-chip--${orderStatusTone(order.settlementStatus)}`}
            >
              {orderStatusLabel(order.settlementStatus)}
            </span>
          </p>
          <p className="account-row__meta">
            {formatDate(order.createdAt)} · {order.itemCount} פריטים
            {order.hasVouchers ? ' · כולל קופונים' : ''}
          </p>
        </div>

        <div className="account-row__actions">
          <Link className="account-btn" href={`/account/orders/${order.id}`}>
            פרטים
          </Link>
          {order.hasInvoice && (
            <a className="account-btn" href={`/account/orders/${order.id}/invoice`} download>
              חשבונית
            </a>
          )}
          {/* Same eligibility as the order page: only a paid order has a charge
              to cancel. The cancel page shows the window and the fee. */}
          {order.status === 'paid' && (
            <Link className="account-btn" href={`/account/orders/${order.id}/cancel`}>
              ביטול הזמנה
            </Link>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="account-row__expanded">
          <div className="account-expanded__content">
            <div className="account-expanded__actions">
              <button
                type="button"
                className="account-btn account-btn--primary"
                onClick={handleReorder}
                disabled={isLoading}
              >
                {isLoading ? 'מוסיף לעגלה...' : 'הוסף להזמנה חדשה'}
              </button>
            </div>
            {message && (
              <p
                className={`account-expanded__message account-expanded__message--${message.type}`}
                role="alert"
              >
                {message.text}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
