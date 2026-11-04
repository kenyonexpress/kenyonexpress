#!/usr/bin/env node
/**
 * S04 SMOKE: one wp_import image through the same SDK path as
 * src/lib/storage/r2.ts (PutObject per AVIF + WebP variant), then an
 * unauthenticated GET on each public URL.
 *
 * Usage:
 *   node scripts/r2-smoke.mjs [--env-file=.env.vercel.production] [--file=wp_import/media/x.webp]
 *
 * Reads R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME
 * (or R2_BUCKET) R2_PUBLIC_BASE_URL from the process env, then from --env-file
 * for whatever the process env lacks. Refuses absent values and the
 * "[SENSITIVE]" placeholder `vercel env pull` writes for encrypted vars.
 *
 * Exit: 0 every public URL answered 200, 1 an upload or GET failed,
 *       2 refused (credential missing).
 */

import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

function parseEnvFile(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
  return out
}

const envFile = arg('env-file', null)
const fileEnv = envFile ? parseEnvFile(resolve(envFile)) : {}
const read = (k) => process.env[k] || fileEnv[k] || ''
const usable = (v) => Boolean(v) && !/^\[SENSITIVE\]$/.test(v)

const cfg = {
  R2_ACCOUNT_ID: read('R2_ACCOUNT_ID'),
  R2_ACCESS_KEY_ID: read('R2_ACCESS_KEY_ID'),
  R2_SECRET_ACCESS_KEY: read('R2_SECRET_ACCESS_KEY'),
  R2_BUCKET_NAME: read('R2_BUCKET_NAME') || read('R2_BUCKET'),
  R2_PUBLIC_BASE_URL: read('R2_PUBLIC_BASE_URL').replace(/\/$/, ''),
}

const missing = Object.entries(cfg)
  .filter(([, v]) => !usable(v))
  .map(([k, v]) => `${k}=${v ? 'placeholder' : 'absent'}`)
if (missing.length) {
  console.log(`REFUSED: ${missing.join(' ')}`)
  process.exit(2)
}

const source =
  arg('file', null) ??
  join(
    'wp_import/media',
    readdirSync('wp_import/media')
      .filter((n) => /\.(webp|jpe?g|png)$/.test(n) && !/\.(thumb|card)\./.test(n))
      .sort()[0],
  )
const original = readFileSync(source)
console.log(`source ${source} ${original.length} bytes`)

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${cfg.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: cfg.R2_ACCESS_KEY_ID, secretAccessKey: cfg.R2_SECRET_ACCESS_KEY },
})

const base = sharp(original).rotate()
const { width } = await base.metadata()
const w = Math.min(width ?? 800, 1600)
const variants = [
  ['webp', await base.clone().resize({ width: w }).webp({ quality: 80 }).toBuffer()],
  ['avif', await base.clone().resize({ width: w }).avif({ quality: 55 }).toBuffer()],
]

const basePath = `smoke/s04-${randomUUID()}`
let failed = 0
for (const [format, body] of variants) {
  const key = `${basePath}/w${w}.${format}`
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: `image/${format}`,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )
  } catch (e) {
    failed++
    console.log(`PUT ${key} FAILED ${e?.name ?? ''} ${e?.message ?? e}`)
    continue
  }
  const url = `${cfg.R2_PUBLIC_BASE_URL}/${key}`
  const res = await fetch(url)
  const type = res.headers.get('content-type')
  console.log(`PUT ${key} ok ${body.length} bytes; GET ${url} -> ${res.status} ${type}`)
  if (res.status !== 200 || type !== `image/${format}`) failed++
}
process.exit(failed ? 1 : 0)
