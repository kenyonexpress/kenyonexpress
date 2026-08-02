import ProfileDetailsForm from '@/components/account/ProfileDetailsForm'
import { signOut } from '@/server/actions/auth'
import { getAccountProfile } from '@/server/queries/account'
import { notFound } from 'next/navigation'

export const metadata = { title: 'הפרטים שלי' }

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
    </>
  )
}
