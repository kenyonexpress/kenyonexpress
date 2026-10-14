#!/usr/bin/env node
/**
 * The sticky pull-request comment: one per PR, found by a marker and edited in
 * place, never a new comment per push. The Vercel bot's own comment stays; it
 * says whether the build passed. This one says where the preview is, which
 * database it talks to, and what will be torn down on close.
 *
 * Hebrew, right to left, because the reader is Ofir. The marker is an HTML
 * comment so it is invisible on the page and stable across wording changes.
 */

export const MARKER = '<!-- ke-preview-bot -->'

const PHASES = new Set(['ready', 'failed', 'skipped', 'torn-down'])

/**
 * @param {object} s
 * @param {number|string} s.pr
 * @param {string} s.sha
 * @param {'ready'|'failed'|'skipped'|'torn-down'} s.phase
 * @param {{ url?: string, deploymentUrl?: string }} [s.preview]
 * @param {{ name?: string, ref?: string, status?: string, withData?: boolean, created?: boolean, deleted?: boolean }} [s.supabase]
 * @param {string[]} [s.missing]   secret names that were not set
 * @param {string} [s.error]
 * @param {string} [s.runUrl]
 */
export function renderPreviewComment(s) {
  if (!PHASES.has(s.phase)) throw new Error(`unknown phase ${s.phase}`)
  const short = String(s.sha ?? '').slice(0, 7)
  const lines = [MARKER, '<div dir="rtl">', '']
  if (s.phase === 'ready') {
    lines.push(`### תצוגה מקדימה ל-PR #${s.pr} מוכנה`)
    lines.push('')
    lines.push('| | |')
    lines.push('|---|---|')
    lines.push(`| כתובת קבועה | ${s.preview?.url ?? ''} |`)
    if (s.preview?.deploymentUrl) lines.push(`| ה-deployment עצמו | ${s.preview.deploymentUrl} |`)
    lines.push(`| commit | \`${short}\` |`)
    lines.push(
      `| מסד נתונים | ענף Supabase \`${s.supabase?.name ?? ''}\` (\`${s.supabase?.ref ?? ''}\`), ${s.supabase?.status ?? ''} |`,
    )
    lines.push(
      `| תוכן הענף | ${s.supabase?.withData ? 'עותק של הסכימה והנתונים של ההורה בזמן היצירה' : 'סכימה בלבד, בלי נתונים'} |`,
    )
    lines.push(
      `| נוצר בריצה הזו | ${s.supabase?.created ? 'כן' : 'לא, הענף מהדחיפה הקודמת נשמר'} |`,
    )
    lines.push('')
    lines.push('התצוגה המקדימה קוראת וכותבת **לענף הזה בלבד**. שום דבר שתעשו בה לא נוגע בפרודקשן.')
    lines.push(
      'בסגירת ה-PR (מיזוג או ביטול) הענף, משתני הסביבה שלו והכתובת הקבועה נמחקים אוטומטית.',
    )
  } else if (s.phase === 'failed') {
    lines.push(`### תצוגה מקדימה ל-PR #${s.pr} נכשלה`)
    lines.push('')
    lines.push(`commit \`${short}\`.`)
    if (s.error) {
      lines.push('')
      lines.push('```')
      lines.push(redact(String(s.error)))
      lines.push('```')
    }
    if (s.supabase?.name)
      lines.push(
        `ענף ה-Supabase \`${s.supabase.name}\` ${s.supabase.ref ? `(\`${s.supabase.ref}\`) ` : ''}נשאר כדי לא לאבד מצב; הוא יימחק בסגירת ה-PR.`,
      )
    if (s.runUrl) lines.push(`הלוג המלא: ${s.runUrl}`)
  } else if (s.phase === 'skipped') {
    lines.push(`### תצוגה מקדימה ל-PR #${s.pr} לא הוקמה`)
    lines.push('')
    const missing = (s.missing ?? []).map((m) => `\`${m}\``).join(', ')
    lines.push(`הסודות הבאים אינם מוגדרים בריפו: ${missing || 'לא ידוע'}.`)
    lines.push(
      'בלעדיהם אין ענף Supabase ל-PR ואין redeploy; הבנייה האוטומטית של Vercel רצה כרגיל, בלי מפתח סודי, ולכן נכשלת ב-prerender. הנוהל ב-`docs/PREVIEW-DEPLOYMENTS.md`.',
    )
  } else {
    lines.push(`### סביבת התצוגה המקדימה של PR #${s.pr} פורקה`)
    lines.push('')
    lines.push('| | |')
    lines.push('|---|---|')
    lines.push(
      `| ענף Supabase \`${s.supabase?.name ?? ''}\` | ${s.supabase?.deleted ? 'נמחק' : 'לא נמצא, לא היה מה למחוק'} |`,
    )
    lines.push(
      `| משתני סביבה לענף ב-Vercel | ${s.removedEnvKeys?.length ? `הוסרו ${s.removedEnvKeys.length}` : 'לא נמצאו'} |`,
    )
    lines.push(`| כתובת קבועה | ${s.aliasRemoved ? 'הוסרה' : 'לא הייתה מוקצית'} |`)
    if (s.error) {
      lines.push('')
      lines.push('הפירוק לא הושלם:')
      lines.push('```')
      lines.push(redact(String(s.error)))
      lines.push('```')
    }
  }
  lines.push('', '</div>')
  return lines.join('\n')
}

/** Bearer tokens and key-shaped strings never reach a public comment, whatever the API echoed back. */
export function redact(text) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/\bsbp_[A-Za-z0-9]+/g, 'sbp_[redacted]')
    .replace(/\bsb_(secret|publishable)_[A-Za-z0-9_-]+/g, 'sb_$1_[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[jwt redacted]')
}

export function findStickyComment(comments) {
  return comments.find((c) => typeof c?.body === 'string' && c.body.includes(MARKER)) ?? null
}

/**
 * Create or edit the sticky comment through the GitHub REST API. The token is
 * the workflow's GITHUB_TOKEN with pull-requests:write; on a fork PR it is
 * read-only and the 403 is reported, not retried.
 */
export async function upsertStickyComment({
  token,
  repo,
  pr,
  body,
  apiBase = 'https://api.github.com',
  fetchImpl = fetch,
}) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'kenyonexpress-preview-bot',
  }
  const list = await fetchImpl(`${apiBase}/repos/${repo}/issues/${pr}/comments?per_page=100`, {
    headers,
  })
  if (!list.ok) throw new Error(`GET comments -> ${list.status}`)
  const existing = findStickyComment(await list.json())
  const res = existing
    ? await fetchImpl(`${apiBase}/repos/${repo}/issues/comments/${existing.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ body }),
      })
    : await fetchImpl(`${apiBase}/repos/${repo}/issues/${pr}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body }),
      })
  if (!res.ok) throw new Error(`${existing ? 'PATCH' : 'POST'} comment -> ${res.status}`)
  const json = await res.json()
  return { id: json.id, updated: Boolean(existing), url: json.html_url }
}

async function main(argv, env) {
  const { readFileSync } = await import('node:fs')
  const stateFile = argv[0]
  if (!stateFile) {
    console.error('usage: comment.mjs <state.json>   (env: GITHUB_TOKEN, GITHUB_REPOSITORY)')
    return 2
  }
  const state = JSON.parse(readFileSync(stateFile, 'utf8'))
  const body = renderPreviewComment(state)
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) {
    console.log(body)
    return 0
  }
  const result = await upsertStickyComment({
    token: env.GITHUB_TOKEN,
    repo: env.GITHUB_REPOSITORY,
    pr: state.pr,
    body,
  })
  console.log(`${result.updated ? 'updated' : 'created'} sticky comment ${result.url}`)
  return 0
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`::error title=Preview comment::${err.message}`)
      process.exit(1)
    },
  )
}
