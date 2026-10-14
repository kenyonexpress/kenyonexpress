/**
 * STATE.md item log, as pure text transforms.
 *
 * The autopilot loop (`~/ke-goals/run-final.sh`) runs one queue item per
 * `claude -p` call and reads the last `RESULT: DONE` / `RESULT: BLOCKED ...`
 * line of the output. Before this module existed nothing wrote that outcome
 * anywhere but `final.log`, so STATE.md only moved when the item itself
 * remembered to edit it, and it had grown to 17,927 lines (1.8 MB) by
 * 2026-10-15. The CLI in `state-log.mjs` calls `applyStateLog` after every
 * item and keeps two invariants that the loop's rules file states in words:
 *
 * 1. Line 1 of STATE.md is `RESUME FROM: <next queue id>`.
 * 2. STATE.md stays under `maxLines` (300); whatever falls off the bottom is
 *    appended to `docs/STATE-ARCHIVE.md` in the same run, never deleted.
 *
 * Each item becomes a three-line block under the `## Item log` heading,
 * newest first:
 *
 *     ### 2026-10-15T04:12:33+07:00
 *     - item: XF01
 *     - RESULT: DONE            (or `- BLOCKED: <reason>`)
 *
 * Nothing here touches the filesystem; the CLI does the reads and writes so
 * the transforms can be tested on strings.
 */

export const RESUME_PREFIX = 'RESUME FROM: '
export const LOG_HEADING = '## Item log'
export const LOG_HEADING_NOTE =
  '## Item log (newest first; three lines per item, written by scripts/state/state-log.mjs after every RESULT)'
export const DEFAULT_MAX_LINES = 300
export const DEFAULT_MAX_LOG_ENTRIES = 25
export const ARCHIVE_TITLE = '# STATE.md archive'

const pad2 = (n) => String(n).padStart(2, '0')

/**
 * ISO 8601 with the machine's own UTC offset (`2026-10-15T04:12:33+07:00`),
 * because every other timestamp in STATE.md is local time and a bare `Z`
 * would read seven hours early next to them.
 */
export function isoLocal(date = new Date()) {
  const offsetMin = -date.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}` +
    `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  )
}

/**
 * Accepts what the loop has: the raw tail of the claude output. Any of
 * `DONE`, `RESULT: DONE`, `BLOCKED why`, `RESULT: BLOCKED: why`, or free text
 * the loop composed itself. Anything that is not DONE is BLOCKED.
 */
export function normaliseResult(raw) {
  let text = String(raw ?? '').trim()
  text = text.replace(/^RESULT:\s*/i, '')
  if (/^DONE\b/i.test(text)) {
    return { status: 'DONE', line: 'RESULT: DONE' }
  }
  let reason = text.replace(/^BLOCKED\b[:\s-]*/i, '').trim()
  if (!reason) reason = 'no reason given'
  return { status: 'BLOCKED', line: `BLOCKED: ${reason}` }
}

export function summaryBlock({ timestamp, id, result }) {
  if (!id || !String(id).trim()) throw new Error('summaryBlock: item id is required')
  const { line } = normaliseResult(result)
  return [`### ${timestamp}`, `- item: ${String(id).trim()}`, `- ${line}`]
}

export function splitLines(text) {
  const lines = String(text ?? '').split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function joinLines(lines) {
  return lines.length ? `${lines.join('\n')}\n` : ''
}

export function setResumeLine(lines, nextId) {
  const out = [...lines]
  const hasResume = out.length > 0 && out[0].startsWith(RESUME_PREFIX)
  if (nextId === undefined || nextId === null || String(nextId).trim() === '') {
    return out
  }
  const line = `${RESUME_PREFIX}${String(nextId).trim()}`
  if (hasResume) out[0] = line
  else out.unshift(line)
  return out
}

export function findLogHeading(lines) {
  return lines.findIndex((l) => l.startsWith(LOG_HEADING))
}

/** Index of the first `## ` / `# ` heading after `from`, or `lines.length`. */
function nextSectionIndex(lines, from) {
  for (let i = from; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i])) return i
  }
  return lines.length
}

/**
 * Where the item log sits and which `### ` blocks it holds. `end` is the
 * exclusive index of the line that starts the next section.
 */
export function logEntries(lines) {
  const headingIdx = findLogHeading(lines)
  if (headingIdx === -1) return { headingIdx, entries: [], end: -1 }
  const end = nextSectionIndex(lines, headingIdx + 1)
  const entries = []
  for (let i = headingIdx + 1; i < end; i++) {
    if (lines[i].startsWith('### ')) entries.push({ start: i, end })
  }
  for (let k = 0; k + 1 < entries.length; k++) entries[k].end = entries[k + 1].start
  return { headingIdx, entries, end }
}

/**
 * Insert the block right under the heading. When there is no heading yet it
 * is created after the resume line and the title (if present), so the file
 * reads: resume, title, log, everything else.
 */
export function prependSummary(lines, block) {
  const out = [...lines]
  let headingIdx = findLogHeading(out)
  if (headingIdx === -1) {
    let at = 0
    if (out[at]?.startsWith(RESUME_PREFIX)) at++
    if (out[at]?.startsWith('# ')) at++
    const insert = [...(at > 0 ? [''] : []), LOG_HEADING_NOTE]
    out.splice(at, 0, ...insert)
    headingIdx = at + insert.length - 1
    if (out[headingIdx + 1] !== '') out.splice(headingIdx + 1, 0, '')
  }
  if (out[headingIdx + 1] !== '') out.splice(headingIdx + 1, 0, '')
  out.splice(headingIdx + 2, 0, ...block, '')
  return out
}

/** Keep the newest `max` log entries; the rest come back as `moved`. */
export function capLogEntries(lines, max) {
  const { entries, end } = logEntries(lines)
  if (entries.length <= max) return { lines: [...lines], moved: [] }
  const cutStart = entries[max].start
  const moved = lines.slice(cutStart, end)
  const out = [...lines.slice(0, cutStart), ...lines.slice(end)]
  while (moved.length && moved[moved.length - 1] === '') moved.pop()
  return { lines: out, moved }
}

/**
 * Keep at most `max` lines. The cut is the last blank line at or before the
 * limit so a paragraph or table is not split in two, as long as that keeps
 * at least half the budget; otherwise the cut is exactly at the limit.
 */
export function trimToMax(lines, max) {
  if (lines.length <= max) return { lines: [...lines], moved: [] }
  let cut = max
  for (let i = max; i > Math.floor(max / 2); i--) {
    if (lines[i - 1] === '') {
      cut = i
      break
    }
  }
  const kept = lines.slice(0, cut)
  const moved = lines.slice(cut)
  while (kept.length && kept[kept.length - 1] === '') kept.pop()
  while (moved.length && moved[0] === '') moved.shift()
  while (moved.length && moved[moved.length - 1] === '') moved.pop()
  return { lines: kept, moved }
}

export function archiveAppend(archiveText, moved, { timestamp, id, source }) {
  if (!moved.length) return archiveText ?? ''
  const existing = splitLines(archiveText)
  const out = existing.length
    ? [...existing]
    : [
        ARCHIVE_TITLE,
        '',
        'Older STATE.md content, moved here by scripts/state/state-log.mjs so that STATE.md stays under 300 lines.',
        'Blocks are appended in the order they were archived; inside a block the lines are verbatim and in their original order.',
      ]
  const where = source ? ` from ${source}` : ''
  out.push('', `## Archived ${timestamp} after ${id} (${moved.length} lines${where})`, '', ...moved)
  return joinLines(out)
}

/**
 * The whole step the loop runs after one item: resume line, three-line
 * summary, entry cap, line cap, archive. Returns the new texts and what moved.
 */
export function applyStateLog({
  stateText,
  archiveText,
  id,
  result,
  next,
  timestamp = isoLocal(),
  maxLines = DEFAULT_MAX_LINES,
  maxLogEntries = DEFAULT_MAX_LOG_ENTRIES,
  source = 'STATE.md',
}) {
  const block = summaryBlock({ timestamp, id, result })
  let lines = splitLines(stateText)
  lines = setResumeLine(lines, next)
  lines = prependSummary(lines, block)
  const capped = capLogEntries(lines, maxLogEntries)
  const trimmed = trimToMax(capped.lines, maxLines)
  const moved = [...capped.moved, ...trimmed.moved]
  const archive = archiveAppend(archiveText, moved, { timestamp, id, source })
  return {
    stateText: joinLines(trimmed.lines),
    archiveText: archive,
    movedCount: moved.length,
    block,
    lineCount: trimmed.lines.length,
    status: normaliseResult(result).status,
  }
}
