#!/usr/bin/env node
/**
 * Deploy the current tree to STAGING, then prove it serves (STEP 69).
 *
 *   node scripts/staging/deploy.mjs [--no-smoke] [--dry]
 *
 * Why a script and not `vercel deploy --prod` by hand: the main checkout's
 * `.vercel/project.json` is linked to `kenyonexpress-prod`, a project no
 * customer reaches, and a bare `vercel deploy` from it ships there and reports
 * success (memory and docs/DEPLOYMENT.md). This script never reads or writes a
 * link file. It sets VERCEL_ORG_ID + VERCEL_PROJECT_ID for the child process,
 * which the CLI honours over the link, so it addresses `kenyonexpress-staging`
 * from any directory and leaves every checkout's link alone.
 *
 * `--archive=tgz` for the same reason production uses it: the upload is one
 * file instead of thousands, and the 04.10 failures were upload-shape, not
 * build-shape (docs/DEPLOY-PIPELINE.md).
 *
 * After the deploy the smoke probe (scripts/deploy/smoke.mjs) runs against
 * the staging host with the gate password from STAGING_PASSWORD, and the
 * script fails if the deploy is not fit. It also checks, with no password,
 * that the host answers 401: a staging that answers 200 to a stranger is the
 * defect this whole step exists to prevent.
 *
 * The password itself is never printed. It is read from the environment
 * (or .env.local) and only ever placed in a request header.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { STAGING_HOST, STAGING_PROJECT_NAME, stagingDeployEnv, stagingHeaders } from './lib.mjs'

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry')
const SMOKE = !args.has('--no-smoke')

function passwordFromEnv() {
  if (process.env.STAGING_PASSWORD?.trim()) return process.env.STAGING_PASSWORD.trim()
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = /^STAGING_PASSWORD=(.*)$/.exec(line.trim())
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    // no .env.local: the environment has to carry it
  }
  return ''
}

function run(cmd, cmdArgs, env) {
  console.log(`$ ${cmd} ${cmdArgs.join(' ')}`)
  if (DRY) return { status: 0, stdout: '' }
  const result = spawnSync(cmd, cmdArgs, {
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  })
  process.stdout.write(result.stdout ?? '')
  return result
}

async function expect401WithoutPassword() {
  const res = await fetch(`https://${STAGING_HOST}/`, { redirect: 'manual' })
  const challenge = res.headers.get('www-authenticate') ?? ''
  if (res.status !== 401 || !/^Basic /i.test(challenge)) {
    console.error(`staging answered ${res.status} with no password; expected 401 + Basic challenge`)
    return false
  }
  console.log(`gate: ${STAGING_HOST} answers 401 with a Basic challenge to a stranger`)
  return true
}

async function expect200WithPassword(password) {
  const res = await fetch(`https://${STAGING_HOST}/`, {
    redirect: 'manual',
    headers: stagingHeaders(password),
  })
  if (res.status !== 200) {
    console.error(`staging answered ${res.status} WITH the password; expected 200`)
    return false
  }
  if (!/noindex/i.test(res.headers.get('x-robots-tag') ?? '')) {
    console.error('staging served the page without X-Robots-Tag: noindex')
    return false
  }
  console.log('gate: the password opens the storefront, and the page is noindex')
  return true
}

async function main() {
  const env = stagingDeployEnv()
  console.log(
    `deploying to ${STAGING_PROJECT_NAME} (${env.VERCEL_PROJECT_ID}) as production of that project`,
  )
  const deploy = run('vercel', ['deploy', '--prod', '--archive=tgz', '--yes'], env)
  if (deploy.status !== 0) {
    console.error(`vercel deploy exited ${deploy.status}`)
    return 1
  }
  if (DRY || !SMOKE) return 0

  const password = passwordFromEnv()
  if (!password) {
    console.error(
      'STAGING_PASSWORD is not set here; cannot smoke the gated host. Deploy itself succeeded.',
    )
    return 1
  }

  let ok = await expect401WithoutPassword()
  ok = (await expect200WithPassword(password)) && ok

  const smoke = run('node', ['scripts/deploy/smoke.mjs', '--base', `https://${STAGING_HOST}`], {
    ...process.env,
    STAGING_PASSWORD: password,
  })
  ok = smoke.status === 0 && ok
  return ok ? 0 : 1
}

main().then((code) => {
  process.exitCode = code
})
