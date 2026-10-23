import { formatIls } from '@/lib/account/format'
import { getMyTier } from '@/server/queries/club'

export const metadata = { title: 'דרגת המועדון שלי' }

export default async function TierPage() {
  const tier = await getMyTier()

  return (
    <>
      <h1 className="account-title">דרגת המועדון שלי</h1>
      <p className="account-subtitle">הדרגה נקבעת לפי הרכישות ב-12 החודשים האחרונים</p>

      {tier ? (
        <section className="account-card">
          <h2 className="account-card__title">{tier.tierNameHe}</h2>
          <p>סך הרכישות ב-12 החודשים האחרונים: {formatIls(tier.spendAgorot)}</p>
          {tier.nextTierNameHe ? (
            <p>
              עוד {formatIls(tier.toNextAgorot)} לדרגת {tier.nextTierNameHe}
            </p>
          ) : (
            <p>הגעת לדרגה הגבוהה ביותר.</p>
          )}
          {tier.benefits.length > 0 && (
            <ul>
              {tier.benefits.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="account-empty">אין כרגע מידע על הדרגה. נסו שוב מאוחר יותר.</p>
      )}
    </>
  )
}
