'use client'

import type { ContactChannel, PageContactConfig } from '@/lib/contact/channels'
import { CONTACT_CHANNEL_KEYS } from '@/lib/contact/channels'
import {
  type ContactChannelActionState,
  updateContactChannel,
  updatePageContactConfig,
} from '@/server/actions/admin/contact-channels'
import { useActionState } from 'react'

const EMPTY: ContactChannelActionState = null
const input =
  'w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-gray-50'

function Status({ state }: { state: ContactChannelActionState }) {
  if (!state) return null
  return 'error' in state ? (
    <output className="text-xs text-red-700">{state.error}</output>
  ) : (
    <output className="text-xs text-green-700">{state.success}</output>
  )
}

export function ContactChannelForm({
  channel,
  readOnly,
}: {
  channel: ContactChannel
  readOnly: boolean
}) {
  const [state, action, pending] = useActionState(updateContactChannel, EMPTY)
  return (
    <form
      action={action}
      className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1.2fr_1fr_2fr_auto_auto_auto] md:items-center"
    >
      <input type="hidden" name="key" value={channel.key} />
      <span className="font-mono text-xs text-gray-500" dir="ltr">
        {channel.key}
      </span>
      <input
        name="label_he"
        defaultValue={channel.labelHe}
        disabled={readOnly}
        aria-label="שם הנושא"
        className={input}
      />
      <input
        name="number"
        defaultValue={channel.number ?? ''}
        placeholder="ריק = מספר החנות"
        disabled={readOnly}
        dir="ltr"
        aria-label="מספר וואטסאפ"
        className={input}
      />
      <input
        name="message_he"
        defaultValue={channel.messageHe}
        disabled={readOnly}
        aria-label="פתיח"
        className={input}
      />
      <input
        name="sort_order"
        type="number"
        min={0}
        max={1000}
        defaultValue={channel.sortOrder}
        disabled={readOnly}
        aria-label="סדר"
        className={`${input} w-20`}
      />
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="active" defaultChecked={channel.active} disabled={readOnly} />
        פעיל
      </label>
      <div className="flex items-center gap-2">
        {!readOnly && (
          <button
            type="submit"
            disabled={pending}
            className="min-h-9 rounded-lg bg-brand px-3 text-xs font-semibold text-brand-dark hover:bg-brand-primary-hover disabled:opacity-60"
          >
            {pending ? '...' : 'שמירה'}
          </button>
        )}
        <Status state={state} />
      </div>
    </form>
  )
}

export function PageContactConfigForm({
  config,
  readOnly,
}: {
  config: PageContactConfig
  readOnly: boolean
}) {
  const [state, action, pending] = useActionState(updatePageContactConfig, EMPTY)
  return (
    <form
      action={action}
      className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_2fr_auto_auto] md:items-center"
    >
      <input type="hidden" name="route_template" value={config.routeTemplate} />
      <span className="font-mono text-xs text-gray-700" dir="ltr">
        {config.routeTemplate}
      </span>
      <select
        name="channel_key"
        defaultValue={config.channelKey}
        disabled={readOnly}
        aria-label="נושא"
        className={input}
      >
        {CONTACT_CHANNEL_KEYS.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
      <input
        name="message_he"
        defaultValue={config.messageHe ?? ''}
        placeholder="ריק = הפתיח של הנושא; {name} = שם המוצר/העסק"
        disabled={readOnly}
        aria-label="פתיח לעמוד"
        className={input}
      />
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="active" defaultChecked={config.active} disabled={readOnly} />
        פעיל
      </label>
      <div className="flex items-center gap-2">
        {!readOnly && (
          <button
            type="submit"
            disabled={pending}
            className="min-h-9 rounded-lg bg-brand px-3 text-xs font-semibold text-brand-dark hover:bg-brand-primary-hover disabled:opacity-60"
          >
            {pending ? '...' : 'שמירה'}
          </button>
        )}
        <Status state={state} />
      </div>
    </form>
  )
}
