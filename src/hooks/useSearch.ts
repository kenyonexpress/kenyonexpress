'use client'

import { type SearchResult, searchProducts } from '@/lib/search'
import { useEffect, useRef, useState } from 'react'

interface Options {
  category?: string | null
  limit?: number
  debounceMs?: number
  minChars?: number
}

interface State {
  results: SearchResult[]
  loading: boolean
  error: string | null
}

/**
 * Debounced product search hook. Cancels in-flight requests when the query
 * changes, so only the latest term's results are applied.
 */
export function useSearch(query: string, options: Options = {}): State {
  const { category = null, limit = 12, debounceMs = 250, minChars = 2 } = options
  const [state, setState] = useState<State>({ results: [], loading: false, error: null })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const term = query.trim()
    if (term.length < minChars) {
      abortRef.current?.abort()
      setState({ results: [], loading: false, error: null })
      return
    }

    setState((s) => ({ ...s, loading: true }))
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await searchProducts(term, { category, limit, signal: controller.signal })
        setState({ results: res.results, loading: false, error: res.error ?? null })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setState({ results: [], loading: false, error: 'search failed' })
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [query, category, limit, debounceMs, minChars])

  return state
}
