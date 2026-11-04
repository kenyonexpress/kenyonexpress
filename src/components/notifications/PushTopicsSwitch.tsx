'use client'

import { t } from '@/lib/i18n/messages'
import { PUSH_TOPICS, type PushTopic } from '@/lib/push/topics'
import { updatePushTopics } from '@/server/actions/push'
import { useEffect, useState, useTransition } from 'react'

/**
 * S21: which pushes THIS browser gets, `order_updates` and `expiry`.
 *
 * Renders only when the browser it runs in has a stored subscription: a topic
 * belongs to a subscription, and before the opt-in above there is none. The
 * server hands over every row's endpoint and topics (the caller's own, read
 * under RLS); the browser picks its own row by its endpoint, the same way
 * `PushDevices` marks "this browser".
 *
 * A new file next to `PushOptIn` rather than inside it: that component is
 * frozen. It refreshes the page after enabling, which is what makes this one
 * appear.
 */
export default function PushTopicsSwitch({
  devices,
}: {
  devices: readonly { endpoint: string; topics: readonly PushTopic[] }[]
}) {
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [topics, setTopics] = useState<PushTopic[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()

  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      if (!('serviceWorker' in navigator)) return null
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager?.getSubscription()
      return subscription?.endpoint ?? null
    }
    probe()
      .catch(() => null)
      .then((found) => {
        if (cancelled) return
        const row = found ? devices.find((d) => d.endpoint === found) : undefined
        setEndpoint(row ? row.endpoint : null)
        setTopics(row ? [...row.topics] : null)
      })
    return () => {
      cancelled = true
    }
  }, [devices])

  if (!endpoint || !topics) return null

  const toggle = (topic: PushTopic, on: boolean) => {
    const previous = topics
    const next = PUSH_TOPICS.filter((x) => (x === topic ? on : previous.includes(x)))
    setTopics(next)
    setError(null)
    start(async () => {
      const result = await updatePushTopics(endpoint, next)
      if ('error' in result) {
        setTopics(previous)
        setError(result.error || t('pushTopics.saveFailed'))
      }
    })
  }

  return (
    <section className="account-card" data-push-topics="">
      <h2 className="account-card__title">{t('pushTopics.title')}</h2>
      {PUSH_TOPICS.map((topic) => (
        <label key={topic} className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={topics.includes(topic)}
            onChange={(event) => toggle(topic, event.target.checked)}
          />
          <span>{t(`pushTopics.${topic}`)}</span>
        </label>
      ))}
      <p className="account-row__meta">{t('pushTopics.note')}</p>
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
