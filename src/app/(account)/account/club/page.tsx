import { ClubTierBadge } from '@/components/account/ClubTierBadge'
import { formatIls } from '@/lib/account/format'
import { DEFAULT_CLUB_TIERS } from '@/lib/club/tiers'
import { getMyClubStanding } from '@/server/queries/club'

export const metadata = { title: 'המועדון שלי' }

export default async function ClubPage() {
  const standing = await getMyClubStanding()

  return (
    <>
      <h1 className="account-title">המועדון שלי</h1>
      <p className="account-subtitle">הדרגה נקבעת לפי סך הרכישות ששולמו ב-12 החודשים האחרונים.</p>

      {standing ? (
        <div className="account-grid">
          <section className="account-card">
            <h2 className="account-card__title">הדרגה שלי</h2>
            <p className="account-row__title">
              <ClubTierBadge tier={standing.current} />
            </p>
            <p className="account-row__meta">
              רכישות ב-12 חודשים: {formatIls(standing.spendAgorot)}
            </p>
          </section>

          <section className="account-card">
            <h2 className="account-card__title">הדרגה הבאה</h2>
            {standing.next ? (
              <>
                <p className="account-row__title">{standing.next.nameHe}</p>
                <p className="account-row__meta">
                  עוד {formatIls(standing.remainingAgorot)} ({standing.progressPercent}%)
                </p>
                <progress
                  max={100}
                  value={standing.progressPercent}
                  aria-label="התקדמות לדרגה הבאה"
                />
              </>
            ) : (
              <p className="account-row__meta">הגעת לדרגה הגבוהה ביותר</p>
            )}
          </section>
        </div>
      ) : (
        <p className="account-row__meta">לא ניתן לטעון את נתוני המועדון כרגע.</p>
      )}

      <section className="account-card" style={{ marginBlockStart: 16 }}>
        <h2 className="account-card__title">הדרגות</h2>
        {DEFAULT_CLUB_TIERS.map((t) => (
          <p key={t.code} className="account-row__meta">
            {t.nameHe}: מ-{formatIls(t.minSpendAgorot)}
          </p>
        ))}
      </section>
    </>
  )
}
