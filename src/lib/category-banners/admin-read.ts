import 'server-only'

import {
  type BannerTheme,
  type CategoryBanner,
  clickThroughPercent,
  isMissingBannerSchema,
} from '@/lib/category-banners/rules'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Admin-side reads of category banners (STEP 62): every row, active or not,
 * with the category named and the counters folded in. Service role, because
 * the list must show what the public policy hides (a switched-off banner)
 * and because `category_banner_stats` has no client policy at all, behind
 * the page's own `requireSection('catalog')` gate.
 *
 * `tableExists` is false on a database without 267, and the page says so
 * instead of rendering an empty list that reads as "no banners yet".
 */

/** The counters are summed over this many days back, today included. */
export const STATS_WINDOW_DAYS = 30

export type AdminCategoryBanner = CategoryBanner & {
  created_at: string
  updated_at: string
  category_name_he: string | null
  category_slug: string | null
  /** Impressions over the window. */
  impressions: number
  /** Clicks over the window. */
  clicks: number
  /** Clicks over impressions, whole percent, or null with nothing shown. */
  ctr: number | null
}

type Row = {
  id: string
  category_id: string
  title_he: string
  subtitle_he: string | null
  image_url: string
  image_alt_he: string
  cta_label_he: string | null
  cta_href: string | null
  theme: string | null
  starts_at: string | null
  ends_at: string | null
  priority: number | string | null
  is_active: boolean
  created_at: string
  updated_at: string
  categories:
    | { name_he: string | null; slug: string | null }
    | { name_he: string | null; slug: string | null }[]
    | null
}

type StatRow = {
  banner_id: string
  impressions: number | string
  clicks: number | string
}

const SELECT =
  'id, category_id, title_he, subtitle_he, image_url, image_alt_he, cta_label_he, cta_href, theme, starts_at, ends_at, priority, is_active, created_at, updated_at, categories(name_he, slug)'

const int = (v: number | string | null | undefined): number => Math.trunc(Number(v ?? 0)) || 0

/** Exported for the tests: the embed shape to the page's shape, counters folded in. */
export function adminBannerFromRow(row: Row, stats: readonly StatRow[]): AdminCategoryBanner {
  const category = Array.isArray(row.categories) ? (row.categories[0] ?? null) : row.categories
  let impressions = 0
  let clicks = 0
  for (const stat of stats) {
    if (stat.banner_id !== row.id) continue
    impressions += int(stat.impressions)
    clicks += int(stat.clicks)
  }
  const theme: BannerTheme = row.theme === 'dark' ? 'dark' : 'light'
  return {
    id: row.id,
    category_id: row.category_id,
    title_he: row.title_he,
    subtitle_he: row.subtitle_he,
    image_url: row.image_url,
    image_alt_he: row.image_alt_he,
    cta_label_he: row.cta_label_he,
    cta_href: row.cta_href,
    theme,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    priority: int(row.priority),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
    category_name_he: category?.name_he ?? null,
    category_slug: category?.slug ?? null,
    impressions,
    clicks,
    ctr: clickThroughPercent(impressions, clicks),
  }
}

/** The first day of the window as `YYYY-MM-DD`, in UTC like the counter function. */
export function statsWindowStart(now: Date, days: number = STATS_WINDOW_DAYS): string {
  const start = new Date(now.getTime() - (days - 1) * 86_400_000)
  return start.toISOString().slice(0, 10)
}

async function statRows(bannerIds: string[], now: Date): Promise<StatRow[]> {
  if (bannerIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('category_banner_stats' as never)
    .select('banner_id, impressions, clicks')
    .in('banner_id', bannerIds)
    .gte('day', statsWindowStart(now))
  if (error) return []
  return (data as unknown as StatRow[] | null) ?? []
}

export async function listCategoryBannersForAdmin(): Promise<{
  banners: AdminCategoryBanner[]
  tableExists: boolean
  error: string | null
}> {
  const { data, error } = await createAdminClient()
    .from('category_banners' as never)
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    if (isMissingBannerSchema(error)) return { banners: [], tableExists: false, error: null }
    return { banners: [], tableExists: true, error: error.message }
  }
  const rows = (data as unknown as Row[] | null) ?? []
  const stats = await statRows(
    rows.map((row) => row.id),
    new Date(),
  )
  return {
    banners: rows.map((row) => adminBannerFromRow(row, stats)),
    tableExists: true,
    error: null,
  }
}

export async function readCategoryBannerForAdmin(id: string): Promise<AdminCategoryBanner | null> {
  const { data, error } = await createAdminClient()
    .from('category_banners' as never)
    .select(SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  const stats = await statRows([id], new Date())
  return adminBannerFromRow(data as unknown as Row, stats)
}

export type CategoryOption = { id: string; name_he: string; slug: string }

/** Every category, active or not, for the picker. Service role: the admin sees them all. */
export async function listCategoryOptions(): Promise<CategoryOption[]> {
  const { data, error } = await createAdminClient()
    .from('categories')
    .select('id, name_he, slug')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
  if (error || !data) return []
  return data as CategoryOption[]
}
