import PasskeyManager from '@/components/account/PasskeyManager'
import { listPasskeys } from '@/server/actions/passkeys'

export const metadata = { title: 'אבטחה וכניסה' }

export default async function SecurityPage() {
  // The same action the client refreshes with, called in-process here for the
  // first paint. `available: false` means migration 178 has not been applied;
  // the page still renders, with an empty list the manager can explain.
  const result = await listPasskeys()
  const initial = 'available' in result && result.available ? result.passkeys : []
  const available = 'available' in result && result.available

  return (
    <>
      <h1 className="account-title">אבטחה וכניסה</h1>
      <p className="account-subtitle">ניהול הדרכים להתחבר לחשבון שלך</p>
      {available ? (
        <PasskeyManager initial={initial} />
      ) : (
        <section className="account-card">
          <h2 className="account-card__title">מפתחות כניסה (Passkeys)</h2>
          <p className="account-row__meta">
            כניסה עם טביעת אצבע או Face ID עדיין לא זמינה בחשבון הזה. בינתיים אפשר להתחבר עם סיסמה,
            עם קישור לאימייל או עם קוד ב-SMS.
          </p>
        </section>
      )}
    </>
  )
}
