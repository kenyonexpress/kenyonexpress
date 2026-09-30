import { canonicalSearchHref } from '@/lib/search/saved'
import { createClient } from '@/lib/supabase/server'
import { getMySavedSearchId } from '@/server/queries/saved-searches'
import SaveSearchButton from './SaveSearchButton'

/**
 * Server half of the save toggle: reads the session and whether this exact
 * search is already saved, then hands the client button its starting state.
 * Mounted inside a Suspense boundary on the results page, so the static shell
 * never waits on the cookie read.
 */
export default async function SaveSearch({ params }: { params: URLSearchParams }) {
  const href = canonicalSearchHref(params)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const savedId = user ? await getMySavedSearchId(href) : null
  return <SaveSearchButton href={href} initialSavedId={savedId} signedIn={Boolean(user)} />
}
