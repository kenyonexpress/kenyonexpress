import { requireSection } from '@/lib/admin/rbac'
import { permanentRedirect } from 'next/navigation'

/**
 * `/admin/status` became `/admin/health` in STEP 67, when the dependency
 * table gained the incident log and the per-service cards. The old path
 * stays as a redirect: it is in the MEGA-BLOCK audit and in operators'
 * bookmarks, and a 404 on the status page during an outage is the one time
 * nobody should be guessing a URL. The guard runs first, as on every admin
 * page: an unauthenticated visitor learns nothing from the redirect, not
 * even that the target exists.
 */
export default async function AdminStatusRedirect(): Promise<never> {
  await requireSection('dashboard')
  permanentRedirect('/admin/health')
}
