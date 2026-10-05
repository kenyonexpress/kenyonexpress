/**
 * The club thresholds as an admin edits them.
 *
 * `club_tiers` (pending 251) is a four-row table keyed by the fixed tier ids
 * in `lib/club/tiers.ts`. The form shows one shekel field per paid tier
 * (silver, gold, platinum); `member` is the floor, pinned to zero by the
 * table's CHECK and by this parser, so it is displayed and not editable.
 *
 * Money arrives as shekel text and leaves as integer agorot through `parseIls`
 * from the money module; the ascending rule is checked here over all three at
 * once, so the operator reads "gold must be above silver" and not a constraint
 * name, and the reader's `tiersFromRows` fallback is never what tells them.
 */

import {
  CLUB_TIER_IDS,
  type ClubTier,
  type ClubTierId,
  type ClubTierRow,
  tiersFromRows,
} from '@/lib/club/tiers'
import { type Agorot, agorot, agorotToIls, parseIls } from '@/lib/money'
import { z } from 'zod'

/** The tiers whose threshold the form edits: everything above the floor. */
export const EDITABLE_CLUB_TIERS = CLUB_TIER_IDS.filter(
  (id): id is Exclude<ClubTierId, 'member'> => id !== 'member',
)

export type EditableClubTierId = (typeof EDITABLE_CLUB_TIERS)[number]

/** Agorot ceiling per threshold: ₪1,000,000. Above that is a typo. */
export const CLUB_THRESHOLD_MAX_AGOROT = 100_000_000

export const CLUB_TIER_LABELS: Record<ClubTierId, string> = {
  member: 'חבר מועדון (רצפה, ₪0)',
  silver: 'כסף: החל מ-(₪)',
  gold: 'זהב: החל מ-(₪)',
  platinum: 'פלטינה: החל מ-(₪)',
}

const thresholdField = (label: string) =>
  z
    .number()
    .int(`${label}: אגורות שלמות בלבד`)
    .min(1, `${label}: חייב להיות מעל ₪0`)
    .max(CLUB_THRESHOLD_MAX_AGOROT, `${label}: מוגבל ל-1,000,000 ₪`)

export const clubTiersSchema = z
  .object({
    silver: thresholdField('כסף'),
    gold: thresholdField('זהב'),
    platinum: thresholdField('פלטינה'),
  })
  .refine((v) => v.gold > v.silver, {
    message: 'סף הזהב חייב להיות גבוה מסף הכסף',
    path: ['gold'],
  })
  .refine((v) => v.platinum > v.gold, {
    message: 'סף הפלטינה חייב להיות גבוה מסף הזהב',
    path: ['platinum'],
  })

export type ClubTierThresholds = z.infer<typeof clubTiersSchema>

export type ParsedClubTiers = { ok: true; value: ClubTierThresholds } | { ok: false; error: string }

/**
 * Shekel text per editable tier -> validated agorot. `parseIls` is the only
 * money conversion; a field it cannot read is reported by the tier's label.
 */
export function parseClubTiersForm(formData: FormData): ParsedClubTiers {
  const raw: Record<string, number> = {}
  for (const id of EDITABLE_CLUB_TIERS) {
    // Thousands separators are what a person types for ₪1,000; `parseIls`
    // reads a bare decimal, so they are dropped before the money module sees it.
    const text = String(formData.get(id) ?? '')
      .replace(/,/g, '')
      .trim()
    if (text === '') return { ok: false, error: `${CLUB_TIER_LABELS[id]}: שדה חובה` }
    try {
      raw[id] = parseIls(text)
    } catch {
      return { ok: false, error: `${CLUB_TIER_LABELS[id]}: סכום לא תקין` }
    }
  }
  const parsed = clubTiersSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first?.message ?? 'ערכים לא תקינים' }
  }
  return { ok: true, value: parsed.data }
}

/** The rows an upsert writes: the three paid tiers, ranks fixed by id order. */
export function thresholdsToRows(
  value: ClubTierThresholds,
): { id: EditableClubTierId; rank: number; min_agorot: number }[] {
  return EDITABLE_CLUB_TIERS.map((id) => ({
    id,
    rank: CLUB_TIER_IDS.indexOf(id),
    min_agorot: value[id],
  }))
}

/** Agorot -> the plain decimal the form shows and `parseIls` reads back. */
export function thresholdInput(value: Agorot | number): string {
  return agorotToIls(agorot(value)).toFixed(2)
}

/** What the form shows for each editable tier, from the tiers in force. */
export function thresholdInputs(tiers: readonly ClubTier[]): Record<EditableClubTierId, string> {
  const out = {} as Record<EditableClubTierId, string>
  for (const id of EDITABLE_CLUB_TIERS) {
    const tier = tiers.find((t) => t.id === id)
    out[id] = thresholdInput(tier?.minAgorot ?? 0)
  }
  return out
}

/** The audit log's before/after shape: id -> agorot, for the rows that exist. */
export function pickThresholds(
  rows: readonly ClubTierRow[] | null | undefined,
): Record<string, number> | null {
  if (!rows) return null
  const parsed = tiersFromRows(rows)
  const source = parsed.ok ? parsed.tiers : null
  const out: Record<string, number> = {}
  if (source) {
    for (const tier of source) out[tier.id] = tier.minAgorot
    return out
  }
  for (const row of rows) {
    const value = typeof row.min_agorot === 'string' ? Number(row.min_agorot) : row.min_agorot
    if (typeof row.id === 'string' && value !== null && Number.isFinite(value)) out[row.id] = value
  }
  return out
}
