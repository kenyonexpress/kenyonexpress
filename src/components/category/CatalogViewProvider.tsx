'use client'

import {
  type CatalogView,
  DEFAULT_CATALOG_VIEW,
  readStoredCatalogView,
  writeStoredCatalogView,
} from '@/lib/catalog-view'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type CatalogViewContextValue = {
  view: CatalogView
  setView: (view: CatalogView) => void
  /** False until the stored preference has been read, so a test can wait for it. */
  ready: boolean
}

/**
 * The default value is what a card gets with NO provider above it, which is the
 * search results page today: it renders the grid and the switcher is absent.
 */
const CatalogViewContext = createContext<CatalogViewContextValue>({
  view: DEFAULT_CATALOG_VIEW,
  setView: () => undefined,
  ready: false,
})

/**
 * Holds the grid / list choice for one listing page (UX14).
 *
 * The server renders the grid, always. The stored preference is read in an
 * effect after hydration and the page re-renders into the list if that is what
 * the shopper chose last time. Reading it during render would make the first
 * client render disagree with the server HTML, which React reports as a
 * hydration mismatch and repairs by throwing the server markup away. The cost
 * of doing it this way is one grid-to-list repaint for a list reader, after
 * the first paint; the cost of the other way is the whole page re-rendering
 * on the client.
 */
export function CatalogViewProvider({ children }: { children: React.ReactNode }) {
  const [view, setViewState] = useState<CatalogView>(DEFAULT_CATALOG_VIEW)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setViewState(readStoredCatalogView())
    setReady(true)
  }, [])

  const setView = useCallback((next: CatalogView) => {
    setViewState(next)
    writeStoredCatalogView(next)
  }, [])

  const value = useMemo(() => ({ view, setView, ready }), [view, setView, ready])
  return <CatalogViewContext.Provider value={value}>{children}</CatalogViewContext.Provider>
}

/**
 * The view a component should RENDER, which is the default on its first
 * render and the context's value from its first effect on.
 *
 * MEASURED, NOT THEORISED (logs/ux14/persist-probe.mjs, the built page):
 * with the stored list, after a reload the body carried `data-view="list"`
 * and all 24 cards were rows, but the list button read `aria-pressed="false"`
 * and the grid button stayed lit. The provider's effect had already set
 * `list` by the time the control bar's Suspense boundary streamed in, so
 * that boundary hydrated against server HTML that said `grid`. React does
 * not patch an attribute that differs during hydration in production; it
 * keeps the server's. The buttons were therefore stuck showing the wrong
 * state while the context said the right one, and a click on "list" changed
 * nothing because the state was already list.
 *
 * So every consumer renders what the server rendered first, and only an
 * ordinary update, never hydration, carries the stored preference into the
 * DOM. The cost is one extra render per consumer after mount; a card that
 * changes shape (grid to row) does so as an update, not as a hydration
 * mismatch that React would have to recover from by throwing the subtree away.
 */
export function useCatalogView(): CatalogViewContextValue {
  const context = useContext(CatalogViewContext)
  const [settled, setSettled] = useState<CatalogView>(DEFAULT_CATALOG_VIEW)
  useEffect(() => {
    setSettled(context.view)
  }, [context.view])
  return settled === context.view ? context : { ...context, view: settled }
}

/**
 * The listing body with the current view on it as `data-view`, so the
 * stylesheet can lay the grid out as rows without the server-rendered `<ul>`
 * knowing anything about the preference. Same class as the plain div the
 * streaming fallback renders, so the box is the same box.
 */
export function CatalogViewBody({
  className = 'category-page__body',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const { view } = useCatalogView()
  return (
    <div className={className} data-view={view}>
      {children}
    </div>
  )
}
