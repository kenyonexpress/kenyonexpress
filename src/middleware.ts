import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { maintenanceFlagOn } from './lib/security/maintenance-flag'

/**
 * Global middleware that enforces maintenance mode when enabled.
 *
 * When maintenance_mode is on (via feature_flags table or MAINTENANCE_MODE env),
 * all routes redirect to /maintenance EXCEPT:
 * - /admin/* (so admins can toggle it back off)
 * - /api/webhooks/* (so payment/order webhooks still work)
 * - /maintenance itself (to avoid redirect loop)
 *
 * The maintenance flag is cached for 30 seconds per instance (maintenance-flag.ts),
 * so a toggle from /admin/feature-flags reaches all instances within that window.
 *
 * FAILS OPEN: if the DB read errors, maintenance reads as OFF. A Supabase hiccup
 * must never take down the whole storefront behind a maintenance page.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Bypass maintenance check for these paths
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/webhooks') ||
    pathname === '/maintenance'
  ) {
    return NextResponse.next()
  }

  // Check maintenance mode (cached 30s, fails open)
  const inMaintenance = await maintenanceFlagOn()

  if (inMaintenance) {
    const maintenanceUrl = new URL('/maintenance', request.url)
    return NextResponse.redirect(maintenanceUrl)
  }

  return NextResponse.next()
}

/**
 * Run middleware on all routes EXCEPT static assets and Next.js internals.
 * The matcher is critical: running on /_next/static would cache-bust every
 * build asset, and running on /api would double-check routes that have their
 * own middleware (like /api/webhooks auth).
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml (root assets)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
}
