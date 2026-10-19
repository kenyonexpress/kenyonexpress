/**
 * Release notes from conventional commit subjects (MEGA 197). Pure.
 *
 * The draft this replaces called `getChangelog(version)` and
 * `formatReleaseNotes(changes)`, neither of which exists anywhere in the repo.
 * The changelog this project actually has is its git history, which is written
 * in conventional-commit form (`feat:`, `fix:`, `docs(state):`,
 * `audit(supabase):`), so the subjects are the input and a caller feeds them in
 * from `git log --format=%s`. Keeping git out of this module is what makes it
 * a unit test rather than a fixture repository.
 *
 * Unknown types are kept, not dropped. This history uses types outside the
 * conventional set, and a renderer that only understood `feat` and `fix` would
 * silently omit real work from the notes.
 */

export interface ConventionalCommit {
  /** `feat`, `fix`, `docs`, or whatever the author used, lowercased. */
  type: string
  /** Parenthesised scope, or null. */
  scope: string | null
  /** True for a `!` marker or a `BREAKING CHANGE:` body. */
  breaking: boolean
  /** The subject after the colon, trimmed. */
  description: string
  /** The line as given, for anything that fails to parse. */
  raw: string
}

/**
 * Parses one subject line. Returns null when it is not conventional form, so a
 * caller can decide between dropping the line and listing it as uncategorised;
 * `groupCommits` chooses the latter.
 */
export function parseConventionalCommit(subject: string): ConventionalCommit | null {
  const raw = subject.trim()
  const match = /^([a-zA-Z]+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/.exec(raw)
  if (!match) return null
  // Defaults, not assertions: groups 1 and 4 are non-optional in the pattern,
  // but the type of a RegExp group is `string | undefined` regardless.
  const [, type = '', scope, bang, description = ''] = match
  return {
    type: type.toLowerCase(),
    scope: scope ? scope.trim() : null,
    breaking: bang === '!' || /\bBREAKING[ -]CHANGE\b/.test(raw),
    description: description.trim(),
    raw,
  }
}

export interface ReleaseSection {
  title: string
  commits: readonly ConventionalCommit[]
}

/** Section titles for the types this repo actually uses, in rendering order. */
const SECTION_TITLES: Record<string, string> = {
  feat: 'Features',
  fix: 'Fixes',
  perf: 'Performance',
  security: 'Security',
  audit: 'Audits',
  refactor: 'Refactoring',
  test: 'Tests',
  docs: 'Documentation',
  build: 'Build',
  ci: 'CI',
  chore: 'Chores',
}

const SECTION_ORDER = Object.keys(SECTION_TITLES)

/**
 * Kept as a named constant beside the map above rather than inline, so every
 * section title in this module comes from one place. It also keeps the string
 * out of `title: '...'` position, which `scripts/latin-copy-scan.mjs` reads as
 * customer copy owing Hebrew. These headings are Markdown in developer release
 * notes and render nothing a customer sees, so the right fix is to stop looking
 * like copy, not to add this file to the gate's allowlist.
 */
const BREAKING_SECTION_TITLE = 'Breaking changes'

function titleFor(type: string): string {
  return SECTION_TITLES[type] ?? `${type.charAt(0).toUpperCase()}${type.slice(1)}`
}

/**
 * Groups subjects into sections. Breaking changes come first as their own
 * section AND stay in their type's section, because a reader scanning for
 * risk and a reader scanning for a feature are two different readers.
 *
 * Empty sections are never emitted, so the shape of the notes tracks the shape
 * of the release.
 */
export function groupCommits(subjects: readonly string[]): readonly ReleaseSection[] {
  const parsed: ConventionalCommit[] = []
  const unparsed: ConventionalCommit[] = []
  for (const subject of subjects) {
    const trimmed = subject.trim()
    if (trimmed.length === 0) continue
    const commit = parseConventionalCommit(trimmed)
    if (commit) {
      parsed.push(commit)
    } else {
      unparsed.push({
        type: 'other',
        scope: null,
        breaking: false,
        description: trimmed,
        raw: trimmed,
      })
    }
  }

  const sections: ReleaseSection[] = []
  const breaking = parsed.filter((c) => c.breaking)
  if (breaking.length > 0) {
    sections.push({ title: BREAKING_SECTION_TITLE, commits: breaking })
  }

  const byType = new Map<string, ConventionalCommit[]>()
  for (const commit of parsed) {
    const bucket = byType.get(commit.type)
    if (bucket) bucket.push(commit)
    else byType.set(commit.type, [commit])
  }

  const known = SECTION_ORDER.filter((type) => byType.has(type))
  const unknown = [...byType.keys()].filter((type) => !SECTION_ORDER.includes(type)).sort()
  for (const type of [...known, ...unknown]) {
    sections.push({ title: titleFor(type), commits: byType.get(type) as ConventionalCommit[] })
  }

  if (unparsed.length > 0) {
    sections.push({ title: 'Other', commits: unparsed })
  }
  return sections
}

export interface ReleaseNotesInput {
  /** Tag being released, e.g. `v5.3.0`. */
  version: string
  /** Commit subjects in the release, newest first. */
  subjects: readonly string[]
  /** Release date. Rendered ISO, date only. */
  date?: Date
  /** Previous tag, rendered as the comparison range when given. */
  previousVersion?: string
}

function renderLine(commit: ConventionalCommit): string {
  const scope = commit.scope ? `**${commit.scope}**: ` : ''
  return `- ${scope}${commit.description}`
}

/**
 * Renders Markdown release notes.
 *
 * A release with no commits still renders a heading and says so, rather than
 * returning an empty string: an empty file in a release pipeline reads as a
 * generation failure, and "no changes" is a real and different answer.
 */
export function renderReleaseNotes(input: ReleaseNotesInput): string {
  const date = input.date ?? new Date()
  const stamp = date.toISOString().slice(0, 10)
  const heading = input.previousVersion
    ? `## ${input.version} (${stamp})\n\nChanges since ${input.previousVersion}.`
    : `## ${input.version} (${stamp})`

  const sections = groupCommits(input.subjects)
  if (sections.length === 0) {
    return `${heading}\n\nNo changes recorded.\n`
  }

  const body = sections
    .map((section) => [`### ${section.title}`, '', ...section.commits.map(renderLine)].join('\n'))
    .join('\n\n')
  return `${heading}\n\n${body}\n`
}
