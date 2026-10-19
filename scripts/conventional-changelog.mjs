#!/usr/bin/env node
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function getLastTag() {
  try {
    const output = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' })
    return output.trim()
  } catch {
    return null
  }
}

function getCommitsSinceTag(fromTag) {
  const cmd = fromTag ? `git log ${fromTag}..HEAD --oneline` : 'git log --oneline'
  const output = execSync(cmd, { encoding: 'utf-8' })
  return output
    .trim()
    .split('\n')
    .filter((line) => line)
}

function parseConventionalCommit(line) {
  const match = line.match(/^([a-f0-9]+)\s+(.+?):\s*(.+)$/)
  if (!match) return null

  const [, hash, type, message] = match
  return { hash: hash.slice(0, 7), type, message }
}

function groupCommits(commits) {
  const groups = {
    feat: [],
    fix: [],
    perf: [],
    docs: [],
    refactor: [],
    test: [],
    ci: [],
    chore: [],
    other: [],
  }

  for (const commit of commits) {
    const parsed = parseConventionalCommit(commit)
    if (!parsed) continue

    const group = groups[parsed.type] || groups.other
    group.push(parsed)
  }

  return groups
}

function generateMarkdown(version, date, groups, baseUrl) {
  const sections = [
    { title: '✨ Features', key: 'feat' },
    { title: '🐛 Bug Fixes', key: 'fix' },
    { title: '⚡ Performance', key: 'perf' },
    { title: '📚 Documentation', key: 'docs' },
    { title: '♻️ Refactoring', key: 'refactor' },
    { title: '✅ Tests', key: 'test' },
    { title: '🔧 CI/CD', key: 'ci' },
    { title: '🏗️ Chores', key: 'chore' },
  ]

  let markdown = `## [${version}](${baseUrl}/releases/tag/${version}) (${date})\n\n`

  let hasContent = false
  for (const { title, key } of sections) {
    if (groups[key].length === 0) continue
    hasContent = true

    markdown += `### ${title}\n\n`
    for (const commit of groups[key]) {
      const commitUrl = `${baseUrl}/commit/${commit.hash}`
      markdown += `- ${commit.message} ([${commit.hash}](${commitUrl}))\n`
    }
    markdown += '\n'
  }

  if (groups.other.length > 0 && hasContent) {
    markdown += '### Other\n\n'
    for (const commit of groups.other) {
      const commitUrl = `${baseUrl}/commit/${commit.hash}`
      markdown += `- ${commit.message} ([${commit.hash}](${commitUrl}))\n`
    }
  }

  return markdown
}

function incrementVersion(currentVersion, type = 'patch') {
  const [major, minor, patch] = currentVersion.split('.').map(Number)

  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

async function main() {
  const args = process.argv.slice(2)
  const versionType = args[0] || 'patch'
  const fromTag = getLastTag()

  const commits = getCommitsSinceTag(fromTag)
  if (commits.length === 0) {
    console.log('No commits since last tag')
    process.exit(0)
  }

  const groups = groupCommits(commits)
  const hasFeatures = groups.feat.length > 0

  let nextVersion = versionType
  if (!['major', 'minor', 'patch'].includes(versionType)) {
    nextVersion = versionType
  } else {
    const currentVersion = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'),
    ).version
    nextVersion = incrementVersion(currentVersion, versionType)
  }

  const date = new Date().toISOString().split('T')[0]
  const baseUrl = 'https://github.com/kenyonexpress/web'
  const changelog = generateMarkdown(nextVersion, date, groups, baseUrl)

  console.log(changelog)
  console.log(`\n---\nVersion: ${nextVersion}\nBreaking changes: ${hasFeatures}\n`)
}

main().catch((err) => {
  console.error('Error generating changelog:', err.message)
  process.exit(1)
})
