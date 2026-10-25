import { requireSection } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FraudAlertActions } from './FraudAlertActions'

export const metadata = { title: 'פרטי התראת הונאה | ניהול' }

export default async function FraudAlertDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  await requireSection('fraud-alerts')
  const { id } = await params

  const supabase = await createClient()

  const { data: alert, error } = await supabase
    .from('fraud_alerts')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !alert) {
    notFound()
  }

  // Fetch user email if user_id exists
  let userEmail: string | null = null
  if (alert.user_id) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', alert.user_id)
      .maybeSingle()
    if (profileError) {
      log.warn('fraud_alert.user_read_failed', { alertId: id, reason: profileError.message })
    }
    userEmail = profile?.email ?? null
  }

  // Fetch reviewer name if reviewed
  let reviewerName: string | null = null
  if (alert.reviewed_by) {
    const { data: reviewer, error: reviewerError } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', alert.reviewed_by)
      .maybeSingle()
    if (reviewerError) {
      log.warn('fraud_alert.reviewer_read_failed', { alertId: id, reason: reviewerError.message })
    }
    reviewerName = reviewer?.full_name ?? reviewer?.email ?? null
  }

  const SEVERITY_LABELS = {
    low: 'נמוך',
    medium: 'בינוני',
    high: 'גבוה',
    critical: 'קריטי',
  }

  const STATUS_LABELS = {
    pending: 'ממתין',
    reviewed: 'נבדק',
    approved: 'אושר',
    blocked: 'נחסם',
  }

  const ALERT_TYPE_LABELS: Record<string, string> = {
    order_rate_exceeded: 'חריגה בקצב הזמנות',
    ip_signup_abuse: 'שימוש לרעה ב-IP להרשמה',
    device_bulk_purchase: 'רכישות מרובות מאותו מכשיר',
    disposable_email: 'אימייל זמני',
    duplicate_email: 'אימייל כפול',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/fraud-alerts"
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          ← חזרה
        </Link>
        <h1 className="text-xl font-bold text-gray-900">פרטי התראת הונאה</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Alert Details */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">פרטי התראה</h2>
            <dl className="grid gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">סוג</dt>
                <dd className="mt-1">{ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">חומרה</dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-sm font-medium ${
                      alert.severity === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : alert.severity === 'high'
                          ? 'bg-orange-100 text-orange-700'
                          : alert.severity === 'medium'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {SEVERITY_LABELS[alert.severity as keyof typeof SEVERITY_LABELS]}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">סטטוס</dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-sm font-medium ${
                      alert.status === 'blocked'
                        ? 'bg-red-100 text-red-700'
                        : alert.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : alert.status === 'reviewed'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {STATUS_LABELS[alert.status as keyof typeof STATUS_LABELS]}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">תאריך יצירה</dt>
                <dd className="mt-1 text-sm">
                  {new Date(alert.created_at).toLocaleString('he-IL')}
                </dd>
              </div>
              {alert.reviewed_at && (
                <>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">נבדק ב</dt>
                    <dd className="mt-1 text-sm">
                      {new Date(alert.reviewed_at).toLocaleString('he-IL')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">נבדק על ידי</dt>
                    <dd className="mt-1 text-sm">{reviewerName ?? 'לא ידוע'}</dd>
                  </div>
                </>
              )}
              {alert.notes && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">הערות</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm">{alert.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Technical Details */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">פרטים טכניים</h2>
            <dl className="grid gap-4">
              {alert.user_id && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">משתמש</dt>
                  <dd className="mt-1 space-y-1">
                    <div className="font-mono text-xs text-black/40">{alert.user_id}</div>
                    {userEmail && <div className="text-sm">{userEmail}</div>}
                  </dd>
                </div>
              )}
              {alert.order_id && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">הזמנה</dt>
                  <dd className="mt-1">
                    <Link
                      href={`/admin/orders/${alert.order_id}`}
                      className="font-mono text-sm text-link hover:underline"
                    >
                      {alert.order_id.slice(0, 16)}...
                    </Link>
                  </dd>
                </div>
              )}
              {alert.ip_address && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">כתובת IP</dt>
                  <dd className="mt-1 font-mono text-sm">{alert.ip_address}</dd>
                </div>
              )}
              {alert.device_fingerprint && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">טביעת מכשיר</dt>
                  <dd className="mt-1 font-mono text-sm">{alert.device_fingerprint}</dd>
                </div>
              )}
              {alert.details && Object.keys(alert.details as object).length > 0 && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">מידע נוסף</dt>
                  <dd className="mt-1">
                    <pre className="overflow-auto rounded bg-gray-50 p-3 text-xs">
                      {JSON.stringify(alert.details, null, 2)}
                    </pre>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Actions */}
        <div className="lg:col-span-1">
          <FraudAlertActions alertId={alert.id} currentStatus={alert.status} />
        </div>
      </div>
    </div>
  )
}
