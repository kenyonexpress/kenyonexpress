import { privacyDoc } from '@/app/(legal)/_content/privacy'
import { termsDoc } from '@/app/(legal)/_content/terms'

/**
 * The acceptance a registration stamps into the new user's metadata (UX24):
 * the moment, and the version of each document in force at that moment,
 * read from the published legal content itself so the record can never say
 * a version the site did not show. Server-side only: it imports the whole
 * תקנון. See lib/auth/terms-acceptance.ts for the client-safe half.
 */
export interface TermsAcceptance {
  terms_accepted_at: string
  terms_version: string
  privacy_version: string
}

export function termsAcceptanceRecord(now: Date = new Date()): TermsAcceptance {
  return {
    terms_accepted_at: now.toISOString(),
    terms_version: termsDoc.version,
    privacy_version: privacyDoc.version,
  }
}
