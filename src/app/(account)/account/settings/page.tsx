import ProfileDetailsForm from '@/components/account/ProfileDetailsForm'
import { signOut } from '@/server/actions/auth'
import { getAccountProfile } from '@/server/queries/account'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'הגדרות' }

/**
 * The settings hub (UX18), the page the "הגדרות" tab opens: the profile
 * form that used to be /account/details (that address is a permanent
 * redirect here now), one card per setting that lives on its own page
 * (notifications, security, payment methods, privacy), and the sign-out.
 *
 * Deletion is NOT here, the same way it was not on /account/details: one
 * form, one action, one erasure list, on /account/privacy, and this page
 * links to it (overview.test.ts holds that, reading the hrefs as source,
 * which is why the four cards are written out rather than mapped).
 */

export default async function SettingsPage() {
  const profile = await getAccountProfile()
  if (!profile) notFound()

  return (
    <>
      <h1 className="account-title">הגדרות</h1>
      <p className="account-subtitle">הפרטים שלך, התראות, אבטחה, אמצעי תשלום ופרטיות</p>

      <section className="account-card" data-settings="profile">
        <h2 className="account-card__title">הפרטים שלי</h2>
        {profile.avatarUrl ? (
          <div className="account-profile-avatar">
            {/* eslint-disable-next-line @next/next/no-img-element -- Google avatar URL */}
            <img
              src={profile.avatarUrl}
              alt=""
              width={64}
              height={64}
              referrerPolicy="no-referrer"
            />
            <p className="account-row__meta">תמונת הפרופיל מחשבון Google</p>
          </div>
        ) : null}
        <p className="account-row__meta" style={{ marginBottom: 14 }}>
          שם וטלפון לשימוש בהזמנות. האימייל מגיע מחשבון Google.
        </p>
        <ProfileDetailsForm
          fullName={profile.fullName}
          phone={profile.phone}
          email={profile.email}
        />
      </section>

      <div className="account-grid">
        <section className="account-card" data-settings="notifications">
          <h2 className="account-card__title">התראות</h2>
          <p className="account-row__meta">
            אילו הודעות לקבל במייל ובדפדפן. הודעות על תשלום, שובר והחזר נשלחות תמיד.
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/notifications">
              להעדפות ההתראות
            </Link>
          </p>
        </section>

        <section className="account-card" data-settings="security">
          <h2 className="account-card__title">אבטחה וכניסה</h2>
          <p className="account-row__meta">
            סיסמה, מפתחות כניסה, אימות דו-שלבי והמכשירים שמחוברים לחשבון.
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/security">
              לאבטחת החשבון
            </Link>
          </p>
        </section>

        <section className="account-card" data-settings="payment-methods">
          <h2 className="account-card__title">אמצעי תשלום</h2>
          <p className="account-row__meta">
            הכרטיסים השמורים לתשלום מהיר. נשמרות רק 4 הספרות האחרונות.
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/tokens">
              לאמצעי התשלום
            </Link>
          </p>
        </section>

        <section className="account-card" data-settings="privacy">
          <h2 className="account-card__title">פרטיות ונתונים</h2>
          <p className="account-row__meta">
            הורדת כל המידע שנשמר עליכם, ניהול ההסכמה לעוגיות, ומחיקת החשבון לצמיתות.
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/privacy">
              לפרטיות ומחיקת החשבון
            </Link>
          </p>
        </section>
      </div>

      <section className="account-card" data-settings="sign-out">
        <h2 className="account-card__title">יציאה מהחשבון</h2>
        <form action={signOut}>
          <button type="submit" className="account-btn">
            התנתקות
          </button>
        </form>
      </section>
    </>
  )
}
