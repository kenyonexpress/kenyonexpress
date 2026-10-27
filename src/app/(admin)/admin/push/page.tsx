import { requireAdminSession } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushBroadcast } from '@/server/actions/admin/push-broadcast'

export const metadata = { title: 'התראות דחיפה' }

export default async function AdminPushPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; failed?: string; removed?: string; error?: string }>
}) {
  await requireAdminSession()
  const params = await searchParams
  const { count } = await createAdminClient()
    .from('push_subscriptions')
    .select('endpoint', { count: 'exact', head: true })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">התראות דחיפה</h1>
      <p className="text-sm text-gray-600">מנויים פעילים בדפדפן: {count ?? 0}</p>
      {params.sent !== undefined && (
        <output className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          נשלח ל-{params.sent}, נכשל {params.failed ?? 0}, הוסרו מנויים לא פעילים{' '}
          {params.removed ?? 0}.
        </output>
      )}
      {params.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {params.error === 'invalid'
            ? 'כותרת (עד 80 תווים) ותוכן (עד 200 תווים) חובה.'
            : params.error === 'forbidden'
              ? 'אין הרשאה.'
              : `השליחה נכשלה: ${params.error}`}
        </p>
      )}
      <form
        action={sendPushBroadcast}
        className="space-y-3 rounded-xl border border-gray-200 bg-white p-4"
      >
        <label className="block text-sm font-medium">
          כותרת
          <input name="title" required maxLength={80} className="mt-1 w-full rounded border p-2" />
        </label>
        <label className="block text-sm font-medium">
          תוכן
          <textarea
            name="body"
            required
            maxLength={200}
            rows={3}
            className="mt-1 w-full rounded border p-2"
          />
        </label>
        <label className="block text-sm font-medium">
          קישור (נתיב באתר)
          <input name="url" defaultValue="/" dir="ltr" className="mt-1 w-full rounded border p-2" />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
        >
          שליחה לכל המנויים
        </button>
      </form>
    </div>
  )
}
