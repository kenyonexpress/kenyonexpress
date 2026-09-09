/**
 * The monthly referral leaderboard: ranking and privacy, decided here.
 *
 * =========================================================================
 * WHAT A LEADERBOARD MAY NOT SHOW ON THIS SITE
 * =========================================================================
 *
 * Names. Emails. Anything a person could be recognised by. `profiles` carries
 * `profiles_select_unified`, which gives a customer their own row and nothing
 * else, and `/account/referrals` already refuses to name the OTHER SIDE of a
 * customer's own referral for exactly that reason -- it prints a date. A
 * leaderboard is a weaker claim to somebody's identity than that, not a
 * stronger one, so it carries no identity at all: a rank, a count, and a flag
 * saying which row is yours.
 *
 * That flag is computed here, on the server, from an id that never reaches the
 * rendered output. `LeaderboardEntry` has no field that could identify anyone,
 * which is what makes it safe to hand to a client component later without
 * re-auditing this decision.
 *
 * =========================================================================
 * TIES SHARE A RANK, AND THE NEXT RANK SKIPS
 * =========================================================================
 *
 * Standard competition ranking (1, 2, 2, 4). Two people on three referrals are
 * both second; nothing here decides which of them is "really" ahead, because
 * nothing in the data does. Ordering ties by user id would be a coin flip
 * presented as a placing.
 */

export interface LeaderboardEntry {
  /** 1-based, ties shared. */
  rank: number
  /** Completed referrals in the month. */
  count: number
  /** Whether this row is the reader's own. Nothing else identifies anyone. */
  isMe: boolean
}

/**
 * Ranks referrers by completed count, highest first.
 *
 * `limit` cuts the visible table, but the reader's own row is appended when it
 * falls outside it: a leaderboard that shows a participant the top ten and not
 * their own standing has answered everybody's question except theirs. The
 * appended row keeps its true rank, so the gap is visible rather than papered
 * over.
 */
export function buildReferralLeaderboard(
  rows: ReadonlyArray<{ referrerUserId: string; count: number }>,
  viewerId: string | null,
  limit = 10,
): { entries: LeaderboardEntry[]; viewerOutsideTop: boolean } {
  const sorted = [...rows].filter((row) => row.count > 0).sort((a, b) => b.count - a.count)

  let lastCount: number | null = null
  let lastRank = 0
  const ranked = sorted.map((row, index) => {
    const rank = lastCount !== null && row.count === lastCount ? lastRank : index + 1
    lastCount = row.count
    lastRank = rank
    return { rank, count: row.count, isMe: viewerId !== null && row.referrerUserId === viewerId }
  })

  const entries = ranked.slice(0, limit)
  const viewerRow = ranked.find((entry) => entry.isMe)
  const viewerOutsideTop = viewerRow !== undefined && !entries.includes(viewerRow)
  if (viewerRow && viewerOutsideTop) entries.push(viewerRow)

  return { entries, viewerOutsideTop }
}

/**
 * First and last instant of the current Israel month, as ISO strings.
 *
 * Israel and not UTC, matching every other monthly boundary in the project: for
 * the first three hours of the 1st the two disagree, and during those hours a
 * UTC window would still be showing last month's table under this month's
 * heading.
 */
export function israelMonthRange(now: Date = new Date()): { from: string; to: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = Number(parts.find((p) => p.type === 'year')?.value ?? '1970')
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '1')

  // Israel is UTC+2 in winter and UTC+3 in summer, so the month starts at
  // 21:00 or 22:00 UTC on the last day of the previous month. Rather than
  // encode which, the window is widened to the UTC day boundary and the rows
  // are re-bucketed by Israel month by the caller. A window that is slightly
  // too wide and then filtered is correct; one that is slightly too narrow
  // silently drops the first evening of the month.
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  from.setUTCDate(from.getUTCDate() - 1)
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0))

  return { from: from.toISOString(), to: to.toISOString() }
}

/** The Israel month a timestamp falls in, as `YYYY-MM`. */
export function israelMonthKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(iso))
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}`
}

/** `2026-09` -> `ספטמבר 2026`. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-')
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 15, 12))
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(date)
}
