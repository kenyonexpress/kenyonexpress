import { describe, expect, it } from 'vitest'
import { groupCommits, parseConventionalCommit, renderReleaseNotes } from './release-notes'

describe('parseConventionalCommit', () => {
  it('reads type, scope and description', () => {
    expect(parseConventionalCommit('feat(cart): add quantity stepper')).toEqual({
      type: 'feat',
      scope: 'cart',
      breaking: false,
      description: 'add quantity stepper',
      raw: 'feat(cart): add quantity stepper',
    })
  })

  it('reads the types this repo actually uses', () => {
    expect(parseConventionalCommit('docs(state): W2 closed')?.type).toBe('docs')
    expect(parseConventionalCommit('audit(supabase): round 2')?.scope).toBe('supabase')
  })

  it('marks a bang or a BREAKING CHANGE note as breaking', () => {
    expect(parseConventionalCommit('feat!: drop v1')?.breaking).toBe(true)
    expect(parseConventionalCommit('feat(api)!: drop v1')?.breaking).toBe(true)
    expect(parseConventionalCommit('fix: BREAKING CHANGE: reshape body')?.breaking).toBe(true)
  })

  it('returns null for a subject that is not conventional form', () => {
    expect(parseConventionalCommit('wip')).toBeNull()
    expect(parseConventionalCommit('merge branch main')).toBeNull()
    expect(parseConventionalCommit('feat:no space')).toBeNull()
  })
})

describe('groupCommits', () => {
  const subjects = [
    'feat(cart): stepper',
    'fix(checkout): rounding',
    'feat!: drop v1',
    'audit(supabase): round 2',
    'plain subject line',
  ]

  it('puts breaking changes first and still lists them under their type', () => {
    const sections = groupCommits(subjects)
    expect(sections[0]?.title).toBe('Breaking changes')
    expect(sections[0]?.commits.map((c) => c.description)).toEqual(['drop v1'])
    const features = sections.find((s) => s.title === 'Features')
    expect(features?.commits.map((c) => c.description)).toEqual(['stepper', 'drop v1'])
  })

  it('keeps a type it does not know instead of dropping the work', () => {
    const titles = groupCommits(subjects).map((s) => s.title)
    expect(titles).toContain('Audits')
    expect(groupCommits(['release(v5): tag'])[0]?.title).toBe('Release')
  })

  it('collects unparseable subjects under Other', () => {
    const other = groupCommits(subjects).find((s) => s.title === 'Other')
    expect(other?.commits.map((c) => c.description)).toEqual(['plain subject line'])
  })

  it('emits no empty sections and ignores blank lines', () => {
    expect(groupCommits(['   ', ''])).toEqual([])
    for (const section of groupCommits(subjects)) {
      expect(section.commits.length).toBeGreaterThan(0)
    }
  })

  it('orders known sections ahead of unknown ones', () => {
    const titles = groupCommits(['audit(x): a', 'fix: b', 'feat: c']).map((s) => s.title)
    expect(titles).toEqual(['Features', 'Fixes', 'Audits'])
  })
})

describe('renderReleaseNotes', () => {
  it('renders a heading, sections and scoped bullets', () => {
    const md = renderReleaseNotes({
      version: 'v5.3.0',
      date: new Date('2026-09-08T10:00:00.000Z'),
      previousVersion: 'v5.2.0',
      subjects: ['feat(cart): stepper', 'fix: rounding'],
    })
    expect(md).toContain('## v5.3.0 (2026-09-08)')
    expect(md).toContain('Changes since v5.2.0.')
    expect(md).toContain('### Features')
    expect(md).toContain('- **cart**: stepper')
    expect(md).toContain('### Fixes')
    expect(md).toContain('- rounding')
  })

  it('says so out loud when a release has no changes', () => {
    const md = renderReleaseNotes({ version: 'v5.3.1', subjects: [] })
    expect(md).toContain('No changes recorded.')
    expect(md.length).toBeGreaterThan(0)
  })
})
