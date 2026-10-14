import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The preview-environment workflow, asserted as text (the deploy-pipeline
 * wiring test is the precedent). Each line below is a way the file can be
 * wrong while every unit test of the scripts stays green: a `secrets.` read
 * inside an `if:` is a step that is skipped forever; a teardown that can be
 * cancelled by a concurrent run leaves a billed branch alive; a provision
 * step that passes keys on argv puts them in the job log.
 */

const root = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const wf = read('.github/workflows/preview.yml')

describe('preview environment workflow', () => {
  it('runs on open, push and close of a pull request, and can be dispatched for one PR', () => {
    expect(wf).toMatch(/pull_request:\s*\n\s*types: \[opened, synchronize, reopened, closed\]/)
    expect(wf).toContain('workflow_dispatch:')
    expect(wf).toMatch(/options: \[provision, teardown\]/)
  })

  it('serialises per PR and never cancels a teardown in progress', () => {
    expect(wf).toContain('group: preview-pr-${{ github.event.pull_request.number || inputs.pr }}')
    expect(wf).toContain("cancel-in-progress: ${{ github.event.action != 'closed' }}")
  })

  it('has exactly a provision job and a teardown job, split on the closed action', () => {
    expect(wf).toMatch(/^\s{2}provision:/m)
    expect(wf).toMatch(/^\s{2}teardown:/m)
    expect(wf).toContain("github.event.action != 'closed'")
    expect(wf).toContain("github.event.action == 'closed'")
  })

  it('never reads `secrets` from a step `if`, which GitHub evaluates as false without an error', () => {
    const ifLines = wf.split('\n').filter((l) => /^\s*if:/.test(l))
    expect(ifLines.length).toBeGreaterThan(4)
    for (const line of ifLines) expect(line).not.toContain('secrets.')
    expect(wf).toContain("steps.gate.outputs.run == 'true'")
  })

  it('gates on both tokens and announces every skip path, including fork PRs', () => {
    expect(wf).toContain('[ -z "$SUPABASE_ACCESS_TOKEN" ]')
    expect(wf).toContain('[ -z "$VERCEL_TOKEN" ]')
    expect(wf).toContain('::warning title=Preview environment skipped::')
    expect(wf).toContain(
      '::notice title=Preview environment skipped::This pull request comes from a fork',
    )
    expect(wf).toContain('::warning title=Preview teardown skipped::')
  })

  it('calls the three scripts and nothing else does the work', () => {
    expect(wf).toContain('node scripts/preview/supabase-branch.mjs ensure')
    expect(wf).toContain('node scripts/preview/supabase-branch.mjs teardown')
    expect(wf).toContain('node scripts/preview/vercel-preview.mjs wire')
    expect(wf).toContain('node scripts/preview/vercel-preview.mjs teardown')
    expect(wf.match(/node scripts\/preview\/comment\.mjs/g)?.length).toBe(2)
    expect(wf).not.toMatch(/run: pnpm install/)
  })

  it('passes the branch keys to the Vercel step through env, never argv', () => {
    const wire = wf.slice(wf.indexOf('id: vercel'), wf.indexOf('id: vercel') + 1200)
    expect(wire).toContain(
      'PREVIEW_SUPABASE_SECRET_KEY: ${{ steps.supabase.outputs.supabase_secret_key }}',
    )
    expect(wire).toContain(
      'PREVIEW_SUPABASE_ANON_KEY: ${{ steps.supabase.outputs.supabase_anon_key }}',
    )
    const runLines = wire
      .split('\n')
      .filter((l) => l.includes('vercel-preview.mjs wire') || /^\s+--/.test(l))
    for (const l of runLines) expect(l).not.toMatch(/secret_key|anon_key/)
  })

  it('writes the sticky comment on every provision outcome and after teardown', () => {
    const commentSteps = wf
      .split('- name:')
      .filter((s) => s.includes('node scripts/preview/comment.mjs'))
    expect(commentSteps).toHaveLength(2)
    expect(commentSteps[0]).toContain('if: always()')
    expect(commentSteps[0]).toContain('"skipped"')
    expect(commentSteps[0]).toContain('"ready"')
    expect(commentSteps[0]).toContain('"failed"')
    expect(commentSteps[1]).toContain('"torn-down"')
  })

  it('tears both halves down even when one fails, then goes red if either did', () => {
    const teardown = wf.slice(wf.indexOf('  teardown:'))
    expect(teardown.match(/continue-on-error: true/g)?.length).toBe(2)
    expect(teardown).toContain(
      "steps.supabase.outcome == 'failure' || steps.vercel.outcome == 'failure'",
    )
    expect(teardown).toContain('::error title=Preview teardown incomplete::')
  })

  it('asks for pull-requests:write and no more', () => {
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read\s*\n\s*pull-requests: write/)
    expect(wf).not.toContain('deployments: write')
    expect(wf).not.toContain('contents: write')
  })
})

describe('preview scripts are registered where they are read', () => {
  it('vitest runs the scripts/preview tests', () => {
    expect(read('vitest.config.ts')).toContain("'scripts/preview/**/*.test.mjs'")
  })

  it('the Supabase branch script refuses to delete anything that is not pr-<n>', () => {
    const src = read('scripts/preview/supabase-branch.mjs')
    expect(src).toContain('if (branch.is_default) return')
    expect(src).toContain('if (branch.persistent) return')
    expect(src).toContain('isPreviewBranchName(branch.name)')
  })

  it('the Vercel script targets the project the GitHub app builds previews on, not the deploy default', () => {
    const src = read('scripts/preview/vercel-preview.mjs')
    expect(src).toContain("DEFAULT_PREVIEW_PROJECT_ID = 'prj_keQjjnDoTb41AYmHy3ia59BKumyt'")
    expect(src).toMatch(/gitSource: \{ type: 'github', repoId, ref, sha \}/)
    expect(src).not.toMatch(/target: 'production'/)
  })

  it('docs and the workflow README describe the workflow', () => {
    expect(read('docs/PREVIEW-DEPLOYMENTS.md')).toContain('preview.yml')
    expect(read('.github/workflows/README.md')).toContain('## `preview.yml`')
    expect(read('docs/INDEX.md')).toContain('[PREVIEW-DEPLOYMENTS.md](PREVIEW-DEPLOYMENTS.md)')
  })
})
