import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { alternatesFor } from './alternates'

/**
 * THE BUG THIS FILE EXISTS FOR.
 *
 * Next merges `metadata` from layout to page one FIELD at a time, and
 * `alternates` is a single field. A page writing
 *
 *     alternates: { canonical: '/products' }
 *
 * replaces the root layout's whole alternates object. The root defines
 * `languages: { 'he-IL': '/' }` and a `types` entry advertising `/feed.xml`,
 * and sixteen route files were overwriting both.
 *
 * Nothing failed. Every page rendered, every page had a canonical, the suite
 * was green, and the served HTML simply had no hreflang and no feed link -
 * measured against a production build on 2026-09-08.
 */

describe('alternatesFor', () => {
  it('keeps the canonical it was given', () => {
    expect(alternatesFor('/products')?.canonical).toBe('/products')
  })

  it('self-references in hreflang rather than pointing at the homepage', () => {
    // A page whose only hreflang pointed at `/` would be declaring the
    // homepage as its Hebrew alternate, which is a different page. Google
    // requires the self-reference from any page carrying hreflang at all.
    expect(alternatesFor('/products')?.languages).toEqual({ 'he-IL': '/products' })
    expect(alternatesFor('/')?.languages).toEqual({ 'he-IL': '/' })
  })

  it('declares one language and no x-default, because there is one language', () => {
    const languages = alternatesFor('/x')?.languages ?? {}
    expect(Object.keys(languages)).toEqual(['he-IL'])
    expect(languages).not.toHaveProperty('x-default')
  })

  it('carries the feed, which nothing else advertises', () => {
    // robots.txt has no field for a feed and no page body links to one, so
    // without this tag /feed.xml exists and is undiscoverable.
    const types = alternatesFor('/')?.types ?? {}
    expect(types['application/rss+xml']).toEqual([
      { url: '/feed.xml', title: 'קניון אקספרס — דילים חדשים' },
    ])
  })

  it('hands each caller its own array, not a shared one', () => {
    // Next types `types` as a mutable array. A shared constant could be
    // mutated by one route into another route's tag.
    const a = alternatesFor('/a')?.types?.['application/rss+xml']
    const b = alternatesFor('/b')?.types?.['application/rss+xml']
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

/**
 * No route may hand-write the object again, because hand-writing it is exactly
 * what dropped the two keys sixteen times.
 */
describe('no route rebuilds the alternates object by hand', () => {
  const APP = resolve(process.cwd(), 'src/app')

  function pages(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) pages(full, out)
      else if (entry === 'page.tsx' || entry === 'layout.tsx') out.push(full)
    }
    return out
  }

  const offenders = pages(APP)
    .filter((file) => {
      // The ROOT layout is where the defaults legitimately live.
      if (relative(process.cwd(), file) === 'src/app/layout.tsx') return false
      const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      return /alternates:\s*\{/.test(src)
    })
    .map((file) => relative(process.cwd(), file))

  it('every route builds alternates with alternatesFor()', () => {
    expect(
      offenders,
      `these write alternates literally and will drop hreflang and the feed:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})
