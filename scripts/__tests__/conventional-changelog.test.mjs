import { describe, expect, it } from 'vitest'

// Mock the child_process module
const mockCommits = [
  'abc1234 feat(cart): add discount support',
  'def5678 fix(checkout): prevent duplicate orders',
  'ghi9012 perf(images): optimize gallery',
  'jkl3456 docs(api): update endpoints',
  'mno7890 refactor(utils): simplify calculations',
  'pqr1234 test(e2e): add purchase flow',
]

describe('conventional-changelog', () => {
  it('should parse conventional commits correctly', () => {
    const parseCommit = (line) => {
      const match = line.match(/^([a-f0-9]+)\s+(.+?):\s*(.+)$/)
      if (!match) return null
      const [, hash, type, message] = match
      return { hash: hash.slice(0, 7), type, message }
    }

    const parsed = parseCommit('abc1234 feat(cart): add discount support')
    expect(parsed).toEqual({
      hash: 'abc1234',
      type: 'feat',
      message: '(cart): add discount support',
    })
  })

  it('should group commits by type', () => {
    const groupCommits = (commits) => {
      const groups = {
        feat: [],
        fix: [],
        perf: [],
        docs: [],
        refactor: [],
        test: [],
      }

      for (const commit of commits) {
        const match = commit.match(/^[a-f0-9]+\s+(.+?):/)
        if (!match) continue
        const type = match[1]
        if (groups[type]) groups[type].push(commit)
      }
      return groups
    }

    const groups = groupCommits(mockCommits)
    expect(groups.feat.length).toBe(1)
    expect(groups.fix.length).toBe(1)
    expect(groups.perf.length).toBe(1)
    expect(groups.test.length).toBe(1)
  })

  it('should increment semantic versions correctly', () => {
    const incrementVersion = (version, type) => {
      const [major, minor, patch] = version.split('.').map(Number)
      if (type === 'major') return `${major + 1}.0.0`
      if (type === 'minor') return `${major}.${minor + 1}.0`
      return `${major}.${minor}.${patch + 1}`
    }

    expect(incrementVersion('1.2.3', 'major')).toBe('2.0.0')
    expect(incrementVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(incrementVersion('1.2.3', 'patch')).toBe('1.2.4')
  })

  it('should generate markdown changelog', () => {
    const generateMarkdown = (version, groups) => {
      let md = `## Version ${version}\n\n`
      if (groups.feat?.length > 0) {
        md += '### Features\n'
        for (const c of groups.feat) {
          md += `- ${c}\n`
        }
      }
      if (groups.fix?.length > 0) {
        md += '### Bug Fixes\n'
        for (const c of groups.fix) {
          md += `- ${c}\n`
        }
      }
      return md
    }

    const groups = { feat: ['add feature 1'], fix: ['fix bug 1'] }
    const md = generateMarkdown('1.0.0', groups)

    expect(md).toContain('## Version 1.0.0')
    expect(md).toContain('### Features')
    expect(md).toContain('### Bug Fixes')
    expect(md).toContain('add feature 1')
    expect(md).toContain('fix bug 1')
  })
})
