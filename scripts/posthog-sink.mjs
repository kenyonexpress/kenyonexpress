#!/usr/bin/env node
/**
 * A local stand-in for PostHog's /capture/ endpoint, so "the events arrive"
 * can be measured on a laptop that has no PostHog key.
 *
 * WHY. `lib/observability/posthog.ts` is inert without NEXT_PUBLIC_POSTHOG_KEY,
 * and the key is not in `.env.local` (nor, on 2026-10-05, in Vercel
 * Production). Every unit test mocks `trackEvent`, so none of them can say
 * whether a built page actually opens a request, with which name, under which
 * id, and only after consent. This does: build and start the app pointed here,
 * drive a browser at it, and read the list.
 *
 *   node scripts/posthog-sink.mjs                 # listens on 4871
 *   POSTHOG_SINK_PORT=5000 node scripts/posthog-sink.mjs
 *
 * then, in another shell:
 *
 *   NEXT_PUBLIC_POSTHOG_KEY=phc_local_sink \
 *   NEXT_PUBLIC_POSTHOG_HOST=http://localhost:4871 pnpm build
 *   NEXT_PUBLIC_POSTHOG_KEY=phc_local_sink \
 *   NEXT_PUBLIC_POSTHOG_HOST=http://localhost:4871 PORT=3417 pnpm start
 *
 * Both variables are read at BUILD time for the browser (inlined) and at START
 * time for the server fan-out, so they must be present for both commands.
 *
 * `GET /events` returns everything received as JSON; `DELETE /events` clears
 * it. `GET /array/<key>/config` and `POST /flags/` are answered with minimal
 * valid responses (see the handlers for why: without them posthog-js never
 * starts sending). Any other POST is accepted as a capture, answered like
 * PostHog does (`{"status":1}`), and every event in it is recorded with the
 * path it arrived on: `/capture/` is the app's own fetch path, `/e/` is
 * posthog-js after the replay recorder has mounted. Nothing is written to
 * disk; stop the process and it is gone.
 */

import { createServer } from 'node:http'
import { gunzipSync } from 'node:zlib'

const PORT = Number(process.env.POSTHOG_SINK_PORT ?? 4871)
const received = []

/**
 * Three encodings arrive here. The fetch path in `posthog.ts` sends plain
 * JSON. posthog-js (the replay loader) sends a raw gzip body (detected by its
 * magic bytes; the query string does not always say so), or `data=<base64
 * json>` form-encoded when gzip is unavailable.
 * A sink that only read the first would list the SDK's batches as `null`,
 * which is how the first run of this file read -- measured, 05.10.2026.
 */
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const buffer = Buffer.concat(chunks)
      try {
        // By magic bytes, not by query string: posthog-js 1.434 posts the gzip
        // body to a bare `/e/` with `text/plain` and no `compression=` param.
        const isGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b
        if (isGzip || /compression=gzip/.test(req.url ?? '')) {
          return resolve(gunzipSync(buffer).toString('utf8'))
        }
        const text = buffer.toString('utf8')
        if (text.startsWith('data=')) {
          return resolve(Buffer.from(decodeURIComponent(text.slice(5)), 'base64').toString('utf8'))
        }
        resolve(text)
      } catch {
        resolve(buffer.toString('utf8'))
      }
    })
  })
}

/** PostHog accepts one event or a batch; both are flattened to one row each. */
function toEvents(raw) {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray(parsed.batch)) return parsed.batch
    return [parsed]
  } catch {
    return [{ unparsed: raw.slice(0, 200) }]
  }
}

const server = createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*')
  // Echo whatever the browser asks to send: a probe that adds its own header
  // (x-forwarded-for, for the login limiter) must not fail CORS preflight here
  // and read as "no events" -- measured, 05.10.2026.
  res.setHeader(
    'access-control-allow-headers',
    req.headers['access-control-request-headers'] ?? 'content-type',
  )
  res.setHeader('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()

  // posthog-js (the replay loader) PAUSES ITS EVENT QUEUE UNTIL /flags/ ANSWERS
  // with a shape it recognises. Answering `{"status":1}` here, as the first
  // version of this file did, left every SDK-routed event (`view_product` once
  // the recorder had mounted) queued in the page forever and the sink reading
  // "not sent" -- measured 05.10.2026. The SDK is told: no flags, no
  // recording, both compressions fine. `/array/<key>/config.js` is left 404 on
  // purpose; the SDK falls back to /flags/ for the same answers.
  // The JSON remote config the SDK asks for after `config.js` fails. Without a
  // 200 here posthog-js never runs `_onRemoteConfig`, never starts its request
  // queue, and `capture()` accepts every event and sends none -- measured
  // 05.10.2026 with a forced capture and six seconds of silence.
  if (req.method === 'GET' && /^\/array\/[^/]+\/config$/.test(req.url ?? '')) {
    res.setHeader('content-type', 'application/json')
    return res.end(
      JSON.stringify({
        token: req.url.split('/')[2],
        supportedCompression: ['gzip-js', 'base64'],
        hasFeatureFlags: false,
        sessionRecording: false,
        autocapture_opt_out: true,
        capturePerformance: false,
        heatmaps: false,
        surveys: false,
        siteApps: [],
      }),
    )
  }

  if (req.method === 'POST' && req.url?.startsWith('/flags')) {
    await readBody(req)
    res.setHeader('content-type', 'application/json')
    return res.end(
      JSON.stringify({
        featureFlags: {},
        featureFlagPayloads: {},
        errorsWhileComputingFlags: false,
        sessionRecording: false,
        supportedCompression: ['gzip-js', 'base64'],
        autocapture_opt_out: true,
      }),
    )
  }

  if (req.url?.startsWith('/events')) {
    if (req.method === 'DELETE') received.length = 0
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify(received))
  }

  if (req.method === 'POST') {
    const body = await readBody(req)
    for (const event of toEvents(body)) {
      if (!event || typeof event.event !== 'string') {
        if (event?.unparsed !== undefined) {
          console.warn(
            `posthog-sink: undecodable body on ${req.url}: ${event.unparsed.slice(0, 60)}`,
          )
        }
        continue
      }
      received.push({
        path: req.url,
        event: event?.event ?? null,
        distinct_id: event.distinct_id ?? event.properties?.distinct_id ?? null,
        properties: event?.properties ?? null,
        at: new Date().toISOString(),
      })
      console.log(`posthog-sink: ${event?.event ?? '?'} <- ${event?.distinct_id ?? '?'}`)
    }
    res.setHeader('content-type', 'application/json')
    return res.end('{"status":1}')
  }

  res.writeHead(404).end()
})

server.listen(PORT, () => {
  console.log(`posthog-sink: listening on http://localhost:${PORT} (GET /events to read)`)
})
