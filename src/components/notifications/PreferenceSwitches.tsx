'use client'

import {
  CHANNELS,
  CHANNEL_LABEL_HE,
  KIND_LABEL_HE,
  type OptionalKind,
  type PreferenceRow,
  preferenceMatrix,
} from '@/lib/notifications/preferences'
import { saveNotificationPreference } from '@/server/actions/notifications'
import { useState, useTransition } from 'react'

/**
 * The switches, and the sentence that explains what is not among them.
 *
 * ONLY OPTIONAL KINDS GET A SWITCH. A greyed-out control labelled "cannot be
 * turned off" reads as a broken control, and it invites the exact support
 * conversation the design avoids. The page says it in a sentence instead: these
 * are the messages you can turn off, and everything else is part of what you
 * bought.
 *
 * SAVED ONE SWITCH AT A TIME, NOT ON A FORM SUBMIT. A settings page with a save
 * button is a page where somebody changes three things, closes the tab, and
 * keeps getting the mail they turned off. Each toggle is its own write, and its
 * own failure.
 *
 * OPTIMISTIC, WITH THE ROLLBACK ON THE CURRENT VALUE. A rejected save reverts
 * the switch that failed and leaves any other switch the customer flipped in the
 * meantime alone -- the same rule the wishlist toggle already follows, and the
 * reason it is written down there too.
 */

type Matrix = ReturnType<typeof preferenceMatrix>

export default function PreferenceSwitches({ rows }: { rows: PreferenceRow[] }) {
  const [matrix, setMatrix] = useState<Matrix>(() => preferenceMatrix(rows))
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()

  const set = (kind: OptionalKind, channel: string, value: boolean) => {
    setMatrix((current) =>
      current.map((row) =>
        row.kind === kind ? { ...row, channels: { ...row.channels, [channel]: value } } : row,
      ),
    )
  }

  return (
    <div>
      <p className="text-sm text-muted">
        אפשר לכבות את ההודעות שכאן. הודעות על הזמנה ששילמתם עליה, על שובר שהונפק ועל החזר כספי
        נשלחות תמיד, כי הן חלק ממה שקניתם.
      </p>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr>
            <th className="p-2 text-start font-semibold">התראה</th>
            {CHANNELS.map((channel) => (
              <th key={channel} className="p-2 text-center font-semibold">
                {CHANNEL_LABEL_HE[channel]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={row.kind} className="border-black/10 border-t">
              <td className="p-2">{KIND_LABEL_HE[row.kind]}</td>
              {CHANNELS.map((channel) => (
                <td key={channel} className="p-2 text-center">
                  <label className="inline-flex h-11 w-11 items-center justify-center">
                    <span className="sr-only">
                      {KIND_LABEL_HE[row.kind]} · {CHANNEL_LABEL_HE[channel]}
                    </span>
                    <input
                      type="checkbox"
                      checked={row.channels[channel]}
                      className="h-5 w-5"
                      onChange={(event) => {
                        const next = event.target.checked
                        set(row.kind, channel, next)
                        setError(null)
                        start(async () => {
                          const result = await saveNotificationPreference(row.kind, channel, next)
                          if (!result.ok) {
                            set(row.kind, channel, !next)
                            setError(result.error ?? 'השמירה נכשלה.')
                          }
                        })
                      }}
                    />
                  </label>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
