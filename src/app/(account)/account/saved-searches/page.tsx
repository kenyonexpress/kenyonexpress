import SavedSearchList from '@/components/account/SavedSearchList'
import { getMySavedSearches } from '@/server/queries/saved-searches'

export const metadata = { title: 'החיפושים השמורים שלי' }

/**
 * The saved searches the results page's bookmark points at (STEP 08). Reads
 * on the user client (RLS owns the boundary) and renders the empty state both
 * for "nothing saved" and for "table not applied yet"; the second resolves the
 * moment pending/245 lands, with no code change here.
 */
export default async function SavedSearchesPage() {
  const searches = await getMySavedSearches()
  return (
    <>
      <h1 className="account-title">החיפושים השמורים שלי</h1>
      <p className="account-subtitle">חיפושים ששמרת, כולל הסינון, במקום אחד</p>
      <SavedSearchList initial={searches} />
    </>
  )
}
