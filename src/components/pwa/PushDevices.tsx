'use client'

import { t } from '@/lib/i18n/messages'
import { removePushSubscriptionById } from '@/server/actions/push'
import type { PushDevice } from '@/server/queries/push-subscriptions'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

/**
 * Every browser the account receives push in, with a way to drop any of them.
 *
 * This is the other half of PushOptIn. That component can only speak for the
 * browser it runs in, because a subscription is minted by a browser and only
 * that browser can unsubscribe itself. What it cannot do is show the phone
 * that was lost or the shared computer at work, and those are exactly the
 * rows a customer wants to remove from somewhere else. The list is read on
 * the server under RLS; the "this browser" mark is added here, because only
 * the browser knows its own endpoint.
 *
 * Removing a far browser deletes the row, not the far subscription: the far
 * browser keeps a subscription nobody will ever send to, which is harmless,
 * and the next opt-in there mints a fresh one. Removing THIS browser's row
 * from the list is allowed too and behaves the same way, so the copy under
 * the list says what the on/off button above it already does better.
 */

export default function PushDevices({ devices }: { devices: PushDevice[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      if (!('serviceWorker' in navigator)) return null
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      return subscription?.endpoint ?? null
    }
    probe()
      .catch(() => null)
      .then((endpoint) => {
        if (!cancelled) setCurrentEndpoint(endpoint)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (devices.length === 0) return null

  const remove = (id: string) => {
    setError(null)
    setBusyId(id)
    start(async () => {
      const result = await removePushSubscriptionById(id)
      if ('error' in result) setError(result.error)
      setBusyId(null)
      router.refresh()
    })
  }

  return (
    <div className="mt-4">
      <p className="account-row__meta">{t('pushDevices.intro')}</p>
      {error && (
        <p className="account-row__meta" role="alert">
          {error}
        </p>
      )}
      <ul className="mt-2" aria-label={t('pushDevices.listLabel')}>
        {devices.map((device) => {
          const isThis = currentEndpoint !== null && currentEndpoint === device.endpoint
          return (
            <li className="account-row" key={device.id}>
              <div className="account-row__main">
                <p className="account-row__title">
                  {device.label}
                  {isThis && (
                    <span className="ms-2 text-xs font-bold text-price">
                      {t('pushDevices.thisBrowser')}
                    </span>
                  )}
                </p>
                <p className="account-row__meta">
                  {t('pushDevices.enabledOn')}{' '}
                  {new Date(device.createdAt).toLocaleDateString('he-IL', {
                    timeZone: 'Asia/Jerusalem',
                  })}
                </p>
              </div>
              <div className="account-row__actions">
                <button
                  type="button"
                  className="account-btn"
                  disabled={pending && busyId === device.id}
                  onClick={() => remove(device.id)}
                >
                  {t('pushDevices.remove')}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
