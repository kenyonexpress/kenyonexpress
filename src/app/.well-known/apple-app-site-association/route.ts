import { buildAppleAppSiteAssociation, parseTeamId } from '@/lib/pwa/deep-links'
import { NextResponse } from 'next/server'

/**
 * iOS Universal Links. Apple fetches this through its CDN, expects
 * `application/json` with NO extension on the path, and refuses redirects.
 * 404 until the Team ID is configured; see `src/lib/pwa/deep-links.ts`.
 */
export function GET(): NextResponse {
  const teamId = parseTeamId(process.env.IOS_APP_TEAM_ID)
  if (!teamId) return new NextResponse(null, { status: 404 })
  return NextResponse.json(buildAppleAppSiteAssociation(teamId), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  })
}
