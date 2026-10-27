'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { broadcastWebPush } from '@/lib/push/broadcast'
import { redirect } from 'next/navigation'

const BACK = '/admin/push'

/** Same-origin paths only: a broadcast must not point customers off-site. */
function safePath(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value.startsWith('/') && !value.startsWith('//') ? value.slice(0, 300) : '/'
}

async function runBroadcast(formData: FormData): Promise<void> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    redirect(`${BACK}?error=forbidden`)
  }
  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  if (title.length < 1 || title.length > 80 || body.length < 1 || body.length > 200) {
    redirect(`${BACK}?error=invalid`)
  }
  const url = safePath(formData.get('url'))
  const result = await broadcastWebPush({ title, body, url, tag: `broadcast:${Date.now()}` })
  if (!result.ok) redirect(`${BACK}?error=${encodeURIComponent(result.reason.slice(0, 80))}`)

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'created',
    entityType: 'push_broadcast',
    entityId: 'web_push',
    changes: { old: null, new: { title, url, sent: result.sent, failed: result.failed } },
  })
  redirect(`${BACK}?sent=${result.sent}&failed=${result.failed}&removed=${result.removed}`)
}

export async function sendPushBroadcast(formData: FormData): Promise<void> {
  return withActionContext('admin.push.broadcast', () => runBroadcast(formData))
}
