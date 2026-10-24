import { formatIls } from '@/lib/commerce/money'
import { alternatesFor } from '@/lib/seo/alternates'
import { listPublicTiers } from '@/server/queries/club'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'מועדון לקוחות',
  description: 'דרגות המועדון של קניון EXPRESS וההטבות בכל דרגה.',
  alternates: alternatesFor('/club'),
}

export default async function ClubPage() {
  const tiers = await listPublicTiers()

  return (
    <section dir="rtl" className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">מועדון לקוחות</h1>
        <p className="text-sm text-gray-600">
          הדרגה נקבעת לפי סך הרכישות ששולמו ב-12 החודשים האחרונים. ההטבות בכל דרגה מפורטות כאן.
        </p>
      </div>
      {tiers === null ? (
        <p className="text-sm text-gray-500">
          לא הצלחנו לטעון את דרגות המועדון. נסו שוב מאוחר יותר.
        </p>
      ) : tiers.length === 0 ? (
        <p className="text-sm text-gray-500">דרגות המועדון יפורסמו בקרוב.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {tiers.map((t) => (
            <li key={t.key} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <h2 className="text-base font-bold text-gray-900">{t.nameHe}</h2>
              <p className="text-sm text-gray-600">
                {t.minSpendAgorot === 0
                  ? 'מתחילים כאן'
                  : `מרכישות של ${formatIls(t.minSpendAgorot)} ומעלה`}
              </p>
              {t.benefits.length > 0 ? (
                <ul className="list-disc ps-5 text-sm text-gray-800 space-y-1">
                  {t.benefits.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">ההטבות בדרגה זו יתעדכנו בקרוב.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
