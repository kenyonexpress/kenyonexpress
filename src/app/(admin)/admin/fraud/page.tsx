import DisputeRow from '@/components/admin/DisputeRow'
import NewDisputeForm from '@/components/admin/NewDisputeForm'
import RefundRequestRow from '@/components/admin/RefundRequestRow'
import RiskQueueRow from '@/components/admin/RiskQueueRow'
import { requireSection } from '@/lib/admin/rbac'
import { riskReasonText } from '@/lib/fraud/risk-score'
import { createAdminClient } from '@/lib/supabase/admin'
import { NOT_APPLIED, listDisputes } from '@/server/queries/disputes'

export const metadata = { title: 'הונאה ומחלוקות' }

/**
 * The fraud console: one page, three queues, and one sentence about what each
 * of them can and cannot decide.
 *
 * ONE PAGE AND NOT THREE, because the three are the same conversation. An
 * operator looking at a flagged order wants to know whether that customer has
 * asked for a refund and whether the bank has already been called; splitting
 * them across three routes means three navigations to answer one question.
 *
 * `payments`, NOT `orders`. Support has read access to orders and must not have
 * it here: the risk rows name the reasons we flagged a person, and a dispute
 * holds what we intend to argue against them.
 */

const MISSING_MESSAGE =
  'הטבלאות של השכבה הזו עדיין לא הוחלו. הקובץ ממתין ב-migrations/pending/202_fraud_abuse.sql, ואומת מול פרודקשן בתוך בלוק שהתגלגל אחורה.'

const ils = (agorot: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agorot / 100)

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

type RiskRow = {
  order_id: string
  score: number
  band: string
  reasons: string[] | null
  created_at: string
}

type RequestRow = {
  id: string
  order_id: string
  reason_code: string
  reason_text: string
  status: string
  created_at: string
}

export default async function FraudPage() {
  await requireSection('payments', 'read')

  const admin = createAdminClient()

  const [riskResult, requestResult, disputes] = await Promise.all([
    admin
      .from('order_risk_assessments')
      .select('order_id, score, band, reasons, created_at')
      .is('reviewed_at', null)
      .eq('band', 'review')
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('refund_requests')
      .select('id, order_id, reason_code, reason_text, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100),
    listDisputes(admin),
  ])

  const riskMissing = MISSING_TABLE.has(riskResult.error?.code ?? '')
  const requestsMissing = MISSING_TABLE.has(requestResult.error?.code ?? '')
  const disputesMissing = disputes === NOT_APPLIED

  const riskRows = (riskResult.data ?? []) as unknown as RiskRow[]
  const requestRows = (requestResult.data ?? []) as unknown as RequestRow[]
  const disputeRows = disputes === NOT_APPLIED ? [] : disputes

  const now = Date.now()
  const overdue = disputeRows.filter(
    (dispute) => dispute.resolved_at === null && new Date(dispute.respond_by).getTime() < now,
  )

  return (
    <div dir="rtl" className="space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-bold">הונאה ומחלוקות</h1>
        <p className="mt-1 text-sm text-gray-600">
          שלושת התורים כאן <strong>לא מזיזים כסף</strong>. הזיכוי עצמו נעשה בקונסולת הזיכויים, אחרי
          שמישהו הכריע כאן. ההפרדה מכוונת.
        </p>
      </header>

      {overdue.length > 0 && (
        <p className="rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-900">
          <bdi>{overdue.length}</bdi> תיקים עברו את מועד התשובה. תיק שלא נענה בזמן נפסד אוטומטית.
        </p>
      )}

      {/* ── Risk queue ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">הזמנות שסומנו לבדיקה</h2>
        <p className="text-sm text-gray-600">
          ציון סיכון אינו סירוב ומעולם לא חסם רכישה. הסירובים קורים בשלב התשלום, לפי ספירה שאפשר
          להסביר ללקוח. כאן יושבת השאלה מה עושים עם הזמנה שכבר שולמה.
        </p>
        {riskMissing ? (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{MISSING_MESSAGE}</p>
        ) : riskRows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
            אין הזמנות הממתינות לבדיקה.
          </p>
        ) : (
          <ul className="space-y-3">
            {riskRows.map((row) => (
              <RiskQueueRow
                key={row.order_id}
                orderId={row.order_id}
                score={row.score}
                createdAt={row.created_at}
                reasons={(row.reasons ?? []).map(riskReasonText)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ── Refund requests ───────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">בקשות החזר מלקוחות</h2>
        <p className="text-sm text-gray-600">
          לקוח יכול לפתוח עד <bdi>3</bdi> בקשות על אותה הזמנה, כולל בקשות שנמשכו. התקרה נאכפת בטריגר
          במסד הנתונים ולא רק בטופס.
        </p>
        {requestsMissing ? (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{MISSING_MESSAGE}</p>
        ) : requestRows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
            אין בקשות פתוחות.
          </p>
        ) : (
          <ul className="space-y-3">
            {requestRows.map((row) => (
              <RefundRequestRow
                key={row.id}
                id={row.id}
                orderId={row.order_id}
                reasonCode={row.reason_code}
                reasonText={row.reason_text}
                createdAt={row.created_at}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ── Disputes ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">תיקי מחלוקת מול הסולק</h2>
        <p className="text-sm text-gray-600">
          התיקים נרשמים ידנית. ה-API של Cardcom שבשימוש כאן אינו שולח הודעת chargeback, ולכן אין מה
          לחווט: התיק מגיע במייל או בטלפון ומישהו מקליד אותו. מה שהטבלה שומרת הוא המועד והראיות.
        </p>
        {disputesMissing ? (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{MISSING_MESSAGE}</p>
        ) : (
          <>
            <NewDisputeForm />
            {disputeRows.length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
                אין תיקים.
              </p>
            ) : (
              <ul className="space-y-3">
                {disputeRows.map((dispute) => (
                  <DisputeRow
                    key={dispute.id}
                    id={dispute.id}
                    orderId={dispute.order_id}
                    providerRef={dispute.provider_ref}
                    kind={dispute.kind}
                    status={dispute.status}
                    amountLabel={ils(dispute.amount_agorot)}
                    respondBy={dispute.respond_by}
                    resolvedAt={dispute.resolved_at}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  )
}
