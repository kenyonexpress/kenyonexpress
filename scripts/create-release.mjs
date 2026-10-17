#!/usr/bin/env node
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_OWNER = 'kenyonexpress'
const GITHUB_REPO = 'web'

if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable not set')
  process.exit(1)
}

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
  }

  for (const commit of commits) {
    const parsed = parseConventionalCommit(commit)
    if (!parsed) continue

    const group = groups[parsed.type]
    if (group) group.push(parsed)
  }

  return groups
}

function generateMarkdown(version, date, groups) {
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

  const baseUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`
  let markdown = `## [${version}](${baseUrl}/releases/tag/${version}) (${date})\n\n`

  for (const { title, key } of sections) {
    if (groups[key].length === 0) continue

    markdown += `### ${title}\n\n`
    for (const commit of groups[key]) {
      const commitUrl = `${baseUrl}/commit/${commit.hash}`
      markdown += `- ${commit.message} ([${commit.hash}](${commitUrl}))\n`
    }
    markdown += '\n'
  }

  return markdown.trim()
}

function incrementVersion(currentVersion, type = 'patch') {
  const [major, minor, patch] = currentVersion.split('.').map(Number)

  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

async function createGitHubRelease(
  version,
  tagName,
  releaseNotes,
  isDraft = false,
  isPrerelease = false,
) {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`

  const payload = {
    tag_name: tagName,
    name: `Release ${version}`,
    body: releaseNotes,
    draft: isDraft,
    prerelease: isPrerelease,
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`GitHub API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data
}

function createGitTag(version) {
  const tagName = `v${version}`

  try {
    execSync(`git tag -a ${tagName} -m "Release ${version}"`, { stdio: 'inherit' })
    execSync(`git push origin ${tagName}`, { stdio: 'inherit' })
    console.log(`✅ Created and pushed tag: ${tagName}`)
    return tagName
  } catch (error) {
    console.error(`Failed to create tag: ${error.message}`)
    process.exit(1)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const versionArg = args[0] || 'patch'
  const isDraft = args.includes('--draft')
  const isPrerelease = args.includes('--prerelease')

  const packageJsonPath = path.join(repoRoot, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  const currentVersion = packageJson.version

  let nextVersion = versionArg
  if (['major', 'minor', 'patch'].includes(versionArg)) {
    nextVersion = incrementVersion(currentVersion, versionArg)
  }

  const fromTag = getLastTag()
  const commits = getCommitsSinceTag(fromTag)

  if (commits.length === 0) {
    console.log('No commits since last tag')
    process.exit(0)
  }

  const groups = groupCommits(commits)
  const date = new Date().toISOString().split('T')[0]
  const releaseNotes = generateMarkdown(nextVersion, date, groups)

  console.log(`\n📝 Release Notes for ${nextVersion}:\n`)
  console.log(releaseNotes)
  console.log('\n')

  try {
    const tagName = createGitTag(nextVersion)

    console.log('\n🚀 Creating GitHub release...')
    const release = await createGitHubRelease(
      nextVersion,
      tagName,
      releaseNotes,
      isDraft,
      isPrerelease,
    )

    console.log(`✅ Release created: ${release.html_url}`)
    console.log(`\n📦 Version ${nextVersion} released successfully`)

    fs.writeFileSync(path.join(repoRoot, '.last-release'), nextVersion, 'utf-8')
  } catch (error) {
    console.error(`Error creating release: ${error.message}`)
    process.exit(1)
  }
}

main()
