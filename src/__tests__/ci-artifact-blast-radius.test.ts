import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AN ARTIFACT NOBODY READS BACK MUST NOT DECIDE THE PIPELINE.
 *
 * MEASURED 2026-09-08. The unit-test job passed, then its coverage upload hit
 * `Failed to FinalizeArtifact: (403) Forbidden` from GitHub's blob storage. The
 * job went red, `build` was skipped for `needs:`, and with it the bundle gate,
 * pixel parity and BOTH E2E jobs. Every gate on that push was decided by a
 * transient error in a diagnostics upload, after the thing being gated had
 * already passed. The next run was green, which is how a flake like this stays
 * a flake rather than becoming a fix.
 *
 * The line is not "artifacts are unimportant". It is whether anything CONSUMES
 * it. `next-build` is downloaded by four jobs; if that upload fails the
 * pipeline genuinely cannot continue and must fail. A report a human opens
 * afterwards is a convenience, and gets `continue-on-error: true`.
 *
 * So the rule is derived from the workflow itself rather than from a list
 * copied into this file: an uploaded name that appears in no `download-artifact`
 * must be non-fatal. Add a consumer and this test stops asking.
 */
const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
const lines = workflow.split('\n')

/** Steps that upload, with the artifact name and whether they are non-fatal. */
function uploadSteps(): { artifact: string; nonFatal: boolean; line: number }[] {
  const steps: { artifact: string; nonFatal: boolean; line: number }[] = []
  for (const [index, line] of lines.entries()) {
    if (!line.includes('upload-artifact@')) continue
    const window = lines.slice(Math.max(0, index - 10), index + 8)
    const named = window.find((l) => /^\s+name: [a-z0-9-]+\s*$/.test(l))
    steps.push({
      artifact: named?.split('name:')[1]?.trim() ?? '',
      nonFatal: window.some((l) => l.trim() === 'continue-on-error: true'),
      line: index + 1,
    })
  }
  return steps
}

/** Artifact names some job downloads. */
function consumed(): Set<string> {
  const names = new Set<string>()
  for (const [index, line] of lines.entries()) {
    if (!line.includes('download-artifact@')) continue
    const named = lines.slice(index, index + 8).find((l) => /^\s+name: [a-z0-9-]+\s*$/.test(l))
    const value = named?.split('name:')[1]?.trim()
    if (value) names.add(value)
  }
  return names
}

describe('CI artifact blast radius', () => {
  const uploads = uploadSteps()
  const downloads = consumed()

  it('found the upload steps, so a rename cannot empty this test', () => {
    expect(uploads.length).toBeGreaterThan(3)
    expect(uploads.every((u) => u.artifact !== '')).toBe(true)
  })

  it('found at least one consumed artifact, so the rule is not vacuously true', () => {
    expect(downloads.size).toBeGreaterThan(0)
  })

  it.each(uploadSteps().map((u) => [u.artifact, u.line] as const))(
    '%s is either consumed by a job or non-fatal',
    (artifact, line) => {
      const step = uploads.find((u) => u.artifact === artifact && u.line === line)
      const isConsumed = downloads.has(artifact)
      expect(
        isConsumed || step?.nonFatal === true,
        `ci.yml:${line} uploads "${artifact}", which no job downloads, without continue-on-error. A transient 403 there fails the job and skips everything downstream of it.`,
      ).toBe(true)
    },
  )

  // The inverse matters just as much: excusing the build output would let a
  // failed upload run four jobs against whatever .next/ they happen to find.
  it('keeps the consumed build artifact fatal', () => {
    const build = uploads.find((u) => u.artifact === 'next-build')
    expect(build).toBeDefined()
    expect(build?.nonFatal).toBe(false)
  })
})
