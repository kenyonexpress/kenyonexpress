#!/usr/bin/env node
/**
 * Stamp a deployment on the three monitoring surfaces so a graph that bends
 * after 14:02 can be read against "14:02 is when dpl_x went live".
 *
 *   node scripts/deploy/mark-release.mjs --sha abc123 --deployment dpl_x --url https://host [--event promoted|rolled-back]
 *
 * Sentry   a release for the sha (idempotent; the build already creates one
 *          when SENTRY_AUTH_TOKEN is set) plus a deploy record on it, which
 *          is what makes "first seen in release" and regression detection
 *          line up with the deploy time instead of the build time.
 * PostHog  an annotation on the project timeline; needs POSTHOG_API_KEY (a
 *          personal key, NOT the public NEXT_PUBLIC_POSTHOG_KEY) and
 *          POSTHOG_PROJECT_ID.
 * Axiom    one event in AXIOM_DEPLOY_DATASET (falls back to AXIOM_DATASET),
 *          so the 5xx and slow-query monitors can be joined to deploys.
 *
 * Each leg is inert without its variables and each reports separately; a
 * missing PostHog key does not stop the Sentry deploy. Exit 0 always: a
 * marker is a convenience and must never fail a deploy that already happened.
 */

import { redactSecrets } from './lib.mjs'

/** The requests to make, computed from env and metadata alone so a test can see them. */
export function buildMarkers(env, meta) {
  const {
    sha,
    deploymentId,
    url,
    event = 'promoted',
    environment = 'production',
    at = new Date(),
  } = meta
  const iso = at.toISOString()
  const markers = []

  if (env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT && sha) {
    const base = (env.SENTRY_URL ?? 'https://sentry.io').replace(/\/$/, '')
    const headers = {
      authorization: `Bearer ${env.SENTRY_AUTH_TOKEN}`,
      'content-type': 'application/json',
    }
    markers.push({
      surface: 'sentry',
      step: 'release',
      url: `${base}/api/0/organizations/${env.SENTRY_ORG}/releases/`,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: sha, projects: [env.SENTRY_PROJECT] }),
      },
      // 208 = already exists, which the build's own upload usually causes.
      okStatuses: [200, 201, 208],
    })
    markers.push({
      surface: 'sentry',
      step: 'deploy',
      url: `${base}/api/0/organizations/${env.SENTRY_ORG}/releases/${encodeURIComponent(sha)}/deploys/`,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify({
          environment,
          name: deploymentId ?? sha,
          url,
          dateStarted: iso,
          dateFinished: iso,
        }),
      },
      okStatuses: [200, 201, 208],
    })
  }

  if (env.POSTHOG_API_KEY && env.POSTHOG_PROJECT_ID) {
    const host = (env.POSTHOG_API_HOST ?? env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.posthog.com')
      .replace(/\/$/, '')
      .replace('.i.posthog.com', '.posthog.com')
    markers.push({
      surface: 'posthog',
      step: 'annotation',
      url: `${host}/api/projects/${env.POSTHOG_PROJECT_ID}/annotations/`,
      init: {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.POSTHOG_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: `deploy ${event}: ${deploymentId ?? ''} ${sha ? sha.slice(0, 7) : ''}`.trim(),
          date_marker: iso,
          scope: 'project',
        }),
      },
      okStatuses: [200, 201],
    })
  }

  const axiomDataset = env.AXIOM_DEPLOY_DATASET ?? env.AXIOM_DATASET
  if (env.AXIOM_TOKEN && axiomDataset) {
    markers.push({
      surface: 'axiom',
      step: 'ingest',
      url: `https://api.axiom.co/v1/datasets/${encodeURIComponent(axiomDataset)}/ingest`,
      init: {
        method: 'POST',
        headers: { authorization: `Bearer ${env.AXIOM_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify([
          { _time: iso, kind: 'deploy', event, environment, deployment_id: deploymentId, sha, url },
        ]),
      },
      okStatuses: [200],
    })
  }

  return markers
}

/** Fire every marker; never throws; returns one line per marker. */
export async function markRelease(env, meta, fetchImpl = fetch) {
  const markers = buildMarkers(env, meta)
  const outcomes = []
  for (const marker of markers) {
    try {
      const res = await fetchImpl(marker.url, {
        ...marker.init,
        signal: AbortSignal.timeout(10_000),
      })
      outcomes.push({
        surface: marker.surface,
        step: marker.step,
        ok: marker.okStatuses.includes(res.status),
        status: res.status,
      })
    } catch (error) {
      outcomes.push({
        surface: marker.surface,
        step: marker.step,
        ok: false,
        status: 0,
        error: redactSecrets(error.message),
      })
    }
  }
  return outcomes
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=', 2)
    out[key] = inline ?? (argv[i + 1]?.startsWith('--') ? 'true' : (argv[++i] ?? 'true'))
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outcomes = await markRelease(process.env, {
    sha: args.sha ?? process.env.GITHUB_SHA,
    deploymentId: args.deployment,
    url: args.url,
    event: args.event ?? 'promoted',
    environment: args.environment ?? 'production',
  })
  if (outcomes.length === 0) {
    console.log(
      'mark-release: no monitoring surface configured (SENTRY_AUTH_TOKEN, POSTHOG_API_KEY, AXIOM_TOKEN all unset); nothing marked',
    )
    return 0
  }
  for (const o of outcomes) {
    console.log(
      `mark-release: ${o.surface}/${o.step} ${o.ok ? 'ok' : 'FAILED'} (${o.status}${o.error ? ` ${o.error}` : ''})`,
    )
  }
  return 0
}

if (process.argv[1]?.endsWith('mark-release.mjs')) {
  main().then((code) => {
    process.exitCode = code
  })
}
