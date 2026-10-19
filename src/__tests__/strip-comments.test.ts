import {
  blankCommentLines,
  codeContains,
  stripComments,
  stripCommentsFor,
} from '@/lib/source-scan/strip-comments.mjs'
import { describe, expect, it } from 'vitest'

const SLASH = '/'
const OPEN = `${SLASH}**`
const CLOSE = `*${SLASH}`

describe('stripComments', () => {
  it('removes a line comment', () => {
    expect(stripComments('// updateTag(TAG)\nconst a = 1').trim()).toBe('const a = 1')
  })

  it('removes a hash comment in a language that has them', () => {
    expect(stripCommentsFor('ci.yml', '# schedule: cron\nrun: pnpm test').trim()).toBe(
      'run: pnpm test',
    )
  })

  // Wrong in BOTH directions if the marker list is merged, which every copy
  // this module replaces had it be.
  it('keeps a TypeScript private field, which is not a comment', () => {
    expect(stripCommentsFor('a.ts', '#count = 0')).toContain('#count')
  })

  it('keeps a CSS id selector, which is not a comment', () => {
    expect(stripCommentsFor('a.css', '#header { color: red }')).toContain('#header')
  })

  it('keeps a YAML glob, which is not a block comment', () => {
    expect(stripCommentsFor('ci.yml', "hashFiles('src/**')\nrun: node audit.mjs")).toContain(
      'audit.mjs',
    )
  })

  it('removes a whole block comment', () => {
    expect(stripComments(`${OPEN} updateTag(TAG) ${CLOSE}\nconst a = 1`).trim()).toBe('const a = 1')
  })

  // THE REGRESSION. audits-are-wired.test.ts filtered lines by their first
  // characters and never removed block comments, so the OPENING line of a
  // JSDoc block was not filtered - it starts with a slash, not with a star -
  // and every literal written on that one line stayed visible to the scanner.
  it('removes a literal written on the opening line of a JSDoc block', () => {
    const source = `${OPEN} mentions updateTag(TAG) here\n * and here\n ${CLOSE}\nconst a = 1`
    expect(stripComments(source)).not.toContain('updateTag')
  })

  it('keeps a URL, whose slashes are not at the start of a line', () => {
    expect(stripComments("const u = 'https://kenyonexpress.co.il'")).toContain('https:')
  })
})

describe('codeContains', () => {
  it('is false when the directive is only described', () => {
    expect(
      codeContains(`${OPEN} we do not call updateTag here ${CLOSE}\nconst a = 1`, 'updateTag'),
    ).toBe(false)
  })

  it('is true when the directive is actually called', () => {
    expect(codeContains('updateTag(CATALOGUE_TAG)', 'updateTag')).toBe(true)
  })
})

describe('blankCommentLines, for the gates that print file:line', () => {
  it('returns exactly one entry per input line', () => {
    const source = `${OPEN}\n * #fed700\n ${CLOSE}\nconst a = 1\n`
    expect(blankCommentLines(source)).toHaveLength(source.split('\n').length)
  })

  // THE PER-LINE CLASSIFIER'S BLIND SPOT. hardcoded-gate.mjs and
  // audit-hardcoded.mjs judged each line alone, so a line could not be seen as
  // sitting INSIDE a block that opened earlier. A literal on a continuation line
  // that happens not to start with a star was reported as hardcoded code.
  it('blanks a continuation line that does not start with a star', () => {
    const source = `${SLASH}* explaining the palette:\n#fed700 is the brand yellow\n${CLOSE}\nconst a = 1`
    const lines = blankCommentLines(source)
    expect(lines[1]).toBe('')
    expect(lines[3]).toBe('const a = 1')
  })

  it('keeps code that follows a block comment on the same line', () => {
    expect(blankCommentLines(`${SLASH}* note ${CLOSE} const a = 1`)[0]?.trim()).toBe('const a = 1')
  })

  it('keeps code that precedes a block comment on the same line', () => {
    expect(blankCommentLines(`const a = 1 ${SLASH}* note ${CLOSE}`)[0]?.trim()).toBe('const a = 1')
  })

  it('resumes at the line where a multi-line block closes', () => {
    const source = `${SLASH}* one\ntwo\nthree ${CLOSE} const a = 1`
    expect(blankCommentLines(source)[2]?.trim()).toBe('const a = 1')
  })
})
