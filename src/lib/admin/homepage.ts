import { RAIL_POOL_LIMIT, discountFraction } from '@/lib/homepage/rails'
import { type SectionKind, parseSectionConfig } from '@/lib/homepage/sections'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The homepage console's reads, which see inactive and unscheduled rows.
 *
 * A separate module from the actions for the reason `admin/content-pages.ts`
 * gives: everything exported from a `'use server'` file is a callable endpoint,
 * so a read helper living beside the mutations would be a public POST that
 * returns unpublished merchandising.
 *
 * These read the BASE TABLES and not `v_*_live`. That is the whole difference
 * between the console and the page: the views apply the schedule, and an
 * operator configuring next week's campaign needs to see the row that has not
 * started. 127 made the same split for the same reason.
 */

export type AdminSectionRow = {
  id: string
  kind: SectionKind
  titleHe: string | null
  subtitleHe: string | null
  position: number
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  config: Record<string, unknown>
  /** False when the config does not parse; the page skips such a section. */
  configValid: boolean
}

export type AdminBannerRow = {
  id: string
  placement: string
  titleHe: string | null
  imageUrl: string
  altHe: string
  linkUrl: string | null
  position: number
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
}

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])

export function homepageTableMissing(error: { code?: string } | null | undefined): boolean {
  return error !== null && error !== undefined && MISSING_TABLE.has(error.code ?? '')
}

export const HOMEPAGE_NOT_APPLIED =
  'טבלאות עמוד הבית עדיין לא הוחלו. ראו migrations/applied/127_homepage_cms.sql'

export const HOMEPAGE_206_NOT_APPLIED =
  'הסוגים החדשים דורשים את migrations/pending/206_homepage_merchandising.sql, שעדיין לא הוחלה.'

export async function listHomepageSections(): Promise<{
  sections: AdminSectionRow[]
  applied: boolean
}> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('homepage_sections')
    .select('id, kind, title_he, subtitle_he, position, is_active, starts_at, ends_at, config')
    .order('position', { ascending: true })

  if (error) {
    if (!homepageTableMissing(error)) {
      log.error('admin.homepage_sections_read_failed', { reason: error.message })
    }
    return { sections: [], applied: false }
  }

  const sections = (data ?? []).map((row) => {
    const config = (row.config ?? {}) as Record<string, unknown>
    return {
      id: row.id,
      kind: row.kind as SectionKind,
      titleHe: row.title_he,
      subtitleHe: row.subtitle_he,
      position: row.position,
      isActive: row.is_active,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      config,
      configValid: parseSectionConfig(row.kind, config) !== null,
    }
  })

  return { sections, applied: true }
}

export async function listHomepageBanners(): Promise<AdminBannerRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('banners')
    .select(
      'id, placement, title_he, image_url, alt_he, link_url, position, is_active, starts_at, ends_at',
    )
    .order('placement', { ascending: true })
    .order('position', { ascending: true })

  if (error) {
    if (!homepageTableMissing(error)) {
      log.error('admin.homepage_banners_read_failed', { reason: error.message })
    }
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    placement: row.placement,
    titleHe: row.title_he,
    imageUrl: row.image_url,
    altHe: row.alt_he,
    linkUrl: row.link_url,
    position: row.position,
    isActive: row.is_active,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }))
}

/**
 * How many products each rule would actually put in a rail, right now.
 *
 * THIS EXISTS BECAUSE ONE OF THE RULES MATCHES NOTHING. `ending_soon` reads
 * `offer_valid_until`, which is null on all 44 active products (measured
 * 2026-09-09), so a rail configured that way renders nothing at all - and
 * `ProductRail` returning null is the right behaviour on the page and a total
 * mystery in the console. Printing the count next to the rule turns "my section
 * disappeared" into "that rule matches 0 products".
 *
 * The pool cap is printed with it, because past `RAIL_POOL_LIMIT` products
 * `biggest_discount` silently narrows from "in the shop" to "among the newest
 * N", and a number that changes meaning without saying so is worse than one
 * that is merely approximate.
 */
export async function railRuleCounts(): Promise<{
  poolSize: number
  poolLimit: number
  biggest_discount: number
  newest: number
  ending_soon: number
}> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('products')
    .select('id, kenyon_price, full_price, offer_valid_until')
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(RAIL_POOL_LIMIT)

  if (error) {
    log.warn('admin.homepage_rule_counts_failed', { reason: error.message })
    return {
      poolSize: 0,
      poolLimit: RAIL_POOL_LIMIT,
      biggest_discount: 0,
      newest: 0,
      ending_soon: 0,
    }
  }

  const pool = data ?? []
  const now = Date.now()
  return {
    poolSize: pool.length,
    poolLimit: RAIL_POOL_LIMIT,
    biggest_discount: pool.filter((row) => discountFraction(row) > 0).length,
    newest: pool.length,
    ending_soon: pool.filter((row) => {
      if (!row.offer_valid_until) return false
      const ends = new Date(row.offer_valid_until).getTime()
      return Number.isFinite(ends) && ends > now
    }).length,
  }
}
