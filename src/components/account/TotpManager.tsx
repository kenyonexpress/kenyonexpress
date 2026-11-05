'use client'

import { t } from '@/lib/i18n/messages'
import { useCallback, useEffect, useState } from 'react'

/**
 * Two-factor (TOTP) and backup codes on /account/security (G6, 05.11.2026).
 * Talks to /api/auth/mfa, the JSON transport over `server/mfa/service.ts`,
 * so this component holds no policy: the route decides who may do what.
 *
 * Shown to every signed-in account; forced only for staff roles by the admin
 * gate. A customer who enables it simply gets a stronger sign-in.
 */
type Status = {
  totp: { verified: boolean; factorId: string | null }
  currentLevel: string | null
  nextLevel: string | null
  backupCodesRemaining: number
  backupCodesIssuedAt: string | null
}

type Enrolment = { factorId: string; qrSvg: string; secret: string }

async function call<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const res = await fetch('/api/auth/mfa', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) return { error: json.error ?? 'שגיאה, נסו שוב' }
  return { data: json }
}

export default function TotpManager() {
  const [status, setStatus] = useState<Status | null>(null)
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/auth/mfa', { cache: 'no-store' })
    if (res.ok) setStatus((await res.json()) as Status)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const enrol = () =>
    run(async () => {
      const r = await call<Enrolment>({ action: 'enroll' })
      if (r.error) setError(r.error)
      else setEnrolment(r.data ?? null)
    })

  const verify = (factorId: string) =>
    run(async () => {
      const r = await call<{ ok: true }>({ action: 'verify', factorId, code })
      if (r.error) setError(r.error)
      else {
        setEnrolment(null)
        setCode('')
        await refresh()
      }
    })

  const issue = () =>
    run(async () => {
      const r = await call<{ codes: string[] }>({ action: 'backup_codes' })
      if (r.error) setError(r.error)
      else {
        setCodes(r.data?.codes ?? null)
        await refresh()
      }
    })

  const challengeFactor = status?.totp.factorId ?? null
  const needsChallenge = status?.totp.verified && status.currentLevel !== 'aal2'

  return (
    <section className="account-card" aria-labelledby="totp-title">
      <h2 id="totp-title" className="account-card__title">
        {t('totp.title')}
      </h2>
      {!status && <p className="account-row__meta">{t('totp.loading')}</p>}

      {status && !status.totp.verified && !enrolment && (
        <div className="space-y-3">
          <p className="account-row__meta">
            קוד מתחלף מאפליקציית אימות (Google Authenticator, 1Password וכדומה) בנוסף לסיסמה.
            לחשבונות צוות זה חובה.
          </p>
          <button type="button" className="account-btn" disabled={busy} onClick={enrol}>
            {busy ? 'יוצר מפתח...' : 'הפעלת אימות דו-שלבי'}
          </button>
        </div>
      )}

      {enrolment && (
        <div className="space-y-3">
          <div className="flex justify-center">
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(enrolment.qrSvg)}`}
              alt={t('totp.qrAlt')}
              width={176}
              height={176}
            />
          </div>
          <p className="account-row__meta">
            אי אפשר לסרוק? המפתח:{' '}
            <code dir="ltr" className="select-all break-all">
              {enrolment.secret}
            </code>
          </p>
          <label className="account-row__meta" htmlFor="totp-first-code">
            הקוד שהאפליקציה מציגה עכשיו
          </label>
          <input
            id="totp-first-code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-center font-mono"
          />
          <button
            type="button"
            className="account-btn"
            disabled={busy || code.length !== 6}
            onClick={() => verify(enrolment.factorId)}
          >
            {busy ? 'מאמת...' : 'אימות והפעלה'}
          </button>
        </div>
      )}

      {status?.totp.verified && (
        <div className="space-y-3">
          <p className="account-row__meta">{t('totp.active')}</p>

          {needsChallenge && challengeFactor && (
            <div className="space-y-2">
              <p className="account-row__meta">
                כדי להנפיק קודי גיבוי, אמתו קודם עם הקוד שהאפליקציה מציגה עכשיו.
              </p>
              <input
                aria-label={t('totp.codeLabel')}
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-center font-mono"
              />
              <button
                type="button"
                className="account-btn"
                disabled={busy || code.length !== 6}
                onClick={() => verify(challengeFactor)}
              >
                {busy ? 'מאמת...' : 'אימות'}
              </button>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="account-card__title">{t('totp.backupTitle')}</h3>
            <p className="account-row__meta">
              {status.backupCodesRemaining > 0
                ? `נותרו ${status.backupCodesRemaining} קודים לשימוש חד-פעמי.`
                : 'עדיין לא הונפקו קודי גיבוי.'}{' '}
              קוד גיבוי מאפס את אפליקציית האימות אם אבדה, ואז מגדירים חדשה.
            </p>
            {!needsChallenge && (
              <button type="button" className="account-btn" disabled={busy} onClick={issue}>
                {busy
                  ? 'מנפיק...'
                  : status.backupCodesRemaining > 0
                    ? 'הנפקת סט חדש (מבטל את הקודם)'
                    : 'הנפקת קודי גיבוי'}
              </button>
            )}
            {codes && (
              <div className="space-y-2">
                <p className="account-row__meta">
                  שמרו את הקודים במקום בטוח. הם מוצגים פעם אחת בלבד.
                </p>
                <ul dir="ltr" className="grid grid-cols-2 gap-1 font-mono text-sm">
                  {codes.map((c) => (
                    <li key={c} className="select-all">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="account-row__meta text-red-700">
          {error}
        </p>
      )}
    </section>
  )
}
