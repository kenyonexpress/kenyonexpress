#!/usr/bin/env node
// G6 (05.11.2026): enrol a verified TOTP factor on the E2E admin fixture, once,
// and print the secret to put in .env.local as E2E_ADMIN_TOTP_SECRET.
//
//   node scripts/e2e/enrol-admin-totp.mjs            # enrol if no verified factor exists
//   node scripts/e2e/enrol-admin-totp.mjs --reset    # remove every TOTP factor first (needs the service key)
//
// Signs in with the fixture's password through the anon key (the same path the
// suite uses), calls auth.mfa.enroll, computes the first code from the secret
// with the suite's own RFC 6238 helper, and verifies it. The secret is printed
// ONCE and stored nowhere by this script.
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) if (v && v !== '[SENSITIVE]') env[k] = v
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq < 1 || line.trimStart().startsWith('#')) continue
      const key = line.slice(0, eq).trim()
      const value = line
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '')
      if (!env[key] && value) env[key] = value
    }
  } catch {}
  return env
}

function base32Decode(input) {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const ch of clean) bits += B32.indexOf(ch).toString(2).padStart(5, '0')
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function totpCode(secret, nowMs = Date.now()) {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(Math.floor(nowMs / 30000)))
  const d = createHmac('sha1', base32Decode(secret)).update(msg).digest()
  const o = d[d.length - 1] & 0x0f
  const bin =
    ((d[o] & 0x7f) << 24) | ((d[o + 1] & 0xff) << 16) | ((d[o + 2] & 0xff) << 8) | (d[o + 3] & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const email = env.E2E_ADMIN_EMAIL ?? 'e2e-admin@test.kenyonexpress.local'
const password = env.E2E_ADMIN_PASSWORD ?? 'E2eAdmin!pass1'
if (!url || !anon) {
  console.error('need NEXT_PUBLIC_SUPABASE_URL and the anon key')
  process.exit(1)
}

const client = createClient(url, anon, { auth: { persistSession: false } })
const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
  email,
  password,
})
if (signInError || !signIn.user) {
  console.error('sign-in failed:', signInError?.message)
  process.exit(1)
}

if (process.argv.includes('--reset')) {
  const service = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY
  if (!service) {
    console.error('--reset needs the service key')
    process.exit(1)
  }
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { data: f } = await admin.auth.admin.mfa.listFactors({ userId: signIn.user.id })
  for (const factor of f?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: signIn.user.id })
    console.log('deleted factor', factor.id, factor.status)
  }
}

const { data: factors } = await client.auth.mfa.listFactors()
const verified = (factors?.totp ?? []).find((f) => f.status === 'verified')
if (verified) {
  console.log(
    `fixture already has a verified TOTP factor (${verified.id}); use --reset to replace it`,
  )
  process.exit(0)
}
for (const f of factors?.all ?? [])
  if (f.factor_type === 'totp') await client.auth.mfa.unenroll({ factorId: f.id })

const { data: enrol, error: enrolError } = await client.auth.mfa.enroll({
  factorType: 'totp',
  friendlyName: 'e2e admin',
})
if (enrolError || !enrol) {
  console.error('enroll failed:', enrolError?.message)
  process.exit(1)
}
const { data: challenge, error: chErr } = await client.auth.mfa.challenge({ factorId: enrol.id })
if (chErr || !challenge) {
  console.error('challenge failed:', chErr?.message)
  process.exit(1)
}
const { error: verifyError } = await client.auth.mfa.verify({
  factorId: enrol.id,
  challengeId: challenge.id,
  code: totpCode(enrol.totp.secret),
})
if (verifyError) {
  console.error('verify failed:', verifyError.message)
  process.exit(1)
}
console.log(`verified TOTP factor ${enrol.id} on ${email}`)
console.log(`E2E_ADMIN_TOTP_SECRET=${enrol.totp.secret}`)
