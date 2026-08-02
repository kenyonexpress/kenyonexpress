import ProfileDetailsForm from '@/components/account/ProfileDetailsForm'
import { getAccountProfile } from '@/server/queries/account'
import { notFound } from 'next/navigation'

export const metadata = { title: 'הפרטים שלי' }

export default async function DetailsPage() {
  const profile = await getAccountProfile()
  if (!profile) notFound()

  return (
    <>
      <h1 className="account-title">הפרטים שלי</h1>
      <p className="account-subtitle">שם וטלפון לשימוש בהזמנות</p>

      <section className="account-card">
        <ProfileDetailsForm
          fullName={profile.fullName}
          phone={profile.phone}
          email={profile.email}
        />
      </section>
    </>
  )
}
