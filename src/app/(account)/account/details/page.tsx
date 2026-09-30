import ProfileDetailsForm from '@/components/account/ProfileDetailsForm'
import { signOut } from '@/server/actions/auth'
import { getAccountProfile } from '@/server/queries/account'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'הפרטים שלי' }

/**
 * Name, phone, sign-out. Deletion is NOT here any more: this page carried a
 * second deletion form (its own confirmation phrase, its own server action,
 * its own erasure list) next to the one on /account/privacy, and the two
 * disagreed on what gets erased. One form, one action, one list, on the page
 * that holds the other privacy rights; this page links to it.
 */
export default async function DetailsPage() {
  const profile = await getAccountProfile()
  if (!profile) notFound()

  return (
    <>
      <h1 className="account-title">הפרטים שלי</h1>
      <p className="account-subtitle">שם וטלפון לשימוש בהזמנות. האימייל מגיע מחשבון Google.</p>

      {profile.avatarUrl ? (
        <div className="account-profile-avatar">
          {/* eslint-disable-next-line @next/next/no-img-element -- Google avatar URL */}
          <img src={profile.avatarUrl} alt="" width={64} height={64} referrerPolicy="no-referrer" />
          <p className="account-row__meta">תמונת הפרופיל מחשבון Google</p>
        </div>
      ) : null}

      <section className="account-card">
        <ProfileDetailsForm
          fullName={profile.fullName}
          phone={profile.phone}
          email={profile.email}
        />
      </section>

      <section className="account-card">
        <h2 className="account-card__title">יציאה מהחשבון</h2>
        <form action={signOut}>
          <button type="submit" className="account-btn">
            התנתקות
          </button>
        </form>
      </section>

      <section className="account-card">
        <h2 className="account-card__title">מחיקת החשבון</h2>
        <p className="account-row__meta">
          הורדת כל המידע שנשמר עליכם ומחיקת החשבון לצמיתות נמצאות בעמוד הפרטיות והנתונים.
        </p>
        <p style={{ marginTop: 12 }}>
          <Link className="account-btn" href="/account/privacy">
            לפרטיות ונתונים
          </Link>
        </p>
      </section>
    </>
  )
}
