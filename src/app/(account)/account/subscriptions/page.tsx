import SubscriptionList from '@/components/account/SubscriptionList'
import { getMySubscriptions } from '@/server/queries/subscriptions'

export const metadata = { title: 'המנויים שלי' }

export default async function SubscriptionsPage() {
  const result = await getMySubscriptions()

  return (
    <>
      <h1 className="account-title">המנויים שלי</h1>
      <p className="account-subtitle">
        חיובים חוזרים שאישרת. ביטול עוצר את החיוב הבא ואינו מזכה על תקופה ששולמה.
      </p>
      {result.ok ? (
        <SubscriptionList subscriptions={result.subscriptions} />
      ) : (
        // Distinguished from "you have none" on purpose: a failed read that
        // renders an empty list tells the customer they have no subscriptions,
        // which is a different and possibly false statement.
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          לא הצלחנו לטעון את המנויים כרגע. נסה שוב עוד רגע.
        </div>
      )}
    </>
  )
}
