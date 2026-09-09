#!/usr/bin/env node
/**
 * The deliverability records, resolved and checked against what Resend needs.
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT AS A PARAGRAPH IN A DOCUMENT. Because a
 * paragraph is what was there before, and the records were wrong anyway.
 * Measured 2026-09-09 against the live zone:
 *
 *   send.kenyonexpress.co.il TXT
 *     "v=spf1 include[...].nses.com include:amazonses.com ~all"
 *                   ^^^^^^^^^^^^^^^ a pasted placeholder, in production DNS
 *
 *   resend._domainkey.kenyonexpress.co.il TXT   -- TWO records, one of them
 *     "p=MIGfMA0CGsq[...]nUa5ZwIDAQAB"          -- also a pasted placeholder
 *     "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ..." -- and the real one
 *
 * Neither is visible from anywhere in this repository, neither produces an
 * error anywhere, and both are the kind of thing that is discovered by a
 * customer not receiving a coupon they paid for. `include[...].nses.com` is not
 * a valid SPF term, and RFC 7208 says a syntax error anywhere in the record
 * makes the WHOLE record a permerror - so the corrupted mechanism does not
 * merely fail to help, it takes the `include:amazonses.com` beside it down with
 * it. Two TXT records at one DKIM selector is an ambiguity RFC 6376 leaves to
 * the verifier, which in practice means some receivers pick the broken one.
 *
 * Exit: 0 all good, 1 a defect, 2 could not resolve.
 *
 *   node scripts/email-dns-check.mjs
 *   node scripts/email-dns-check.mjs --domain=example.com
 */

import { promises as dns } from 'node:dns'

const args = process.argv.slice(2)
const domainArg = args.find((a) => a.startsWith('--domain='))
const DOMAIN = domainArg ? domainArg.slice('--domain='.length) : 'kenyonexpress.co.il'

/** Resend's bounce/return-path subdomain, which is also where its SPF lives. */
const SEND = `send.${DOMAIN}`
const DKIM = `resend._domainkey.${DOMAIN}`
const DMARC = `_dmarc.${DOMAIN}`

const findings = []
const notes = []

function fail(where, what, why) {
  findings.push({ where, what, why })
}

/** One TXT name's records, each already joined from its chunks. */
async function txt(name) {
  try {
    return (await dns.resolveTxt(name)).map((chunks) => chunks.join(''))
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') return []
    throw error
  }
}

/**
 * SPF terms that are not syntactically a term.
 *
 * Deliberately narrow: it does not try to be an SPF parser. It looks for the
 * one shape that actually occurred - a mechanism with no `:` where one is
 * required, which is what a truncated paste leaves behind - plus the literal
 * ellipsis, which no legitimate record contains.
 */
function spfSyntaxErrors(record) {
  const bad = []
  for (const term of record.split(/\s+/).slice(1)) {
    if (term.length === 0) continue
    if (term.includes('[') || term.includes('...')) {
      bad.push(term)
      continue
    }
    const bare = term.replace(/^[+\-~?]/, '')
    if (/^(include|a|mx|ptr|ip4|ip6|exists|redirect|exp)/.test(bare)) {
      const needsValue = /^(include|ip4|ip6|exists|redirect|exp)/.test(bare)
      if (needsValue && !bare.includes(':') && !bare.includes('=')) bad.push(term)
    }
  }
  return bad
}

async function checkSpf() {
  const records = (await txt(SEND)).filter((r) => r.toLowerCase().startsWith('v=spf1'))

  if (records.length === 0) {
    fail(
      SEND,
      'no SPF record',
      'Resend sends with this as the return-path domain; with no SPF here the bounce domain cannot pass SPF and DMARC has nothing to align.',
    )
    return
  }
  // RFC 7208 section 3.2: more than one SPF record is a permerror, full stop.
  if (records.length > 1) {
    fail(
      SEND,
      `${records.length} SPF records`,
      'RFC 7208 makes more than one a permerror. Exactly one TXT record beginning v=spf1.',
    )
  }

  for (const record of records) {
    const bad = spfSyntaxErrors(record)
    if (bad.length > 0) {
      fail(
        SEND,
        `SPF contains ${bad.map((b) => JSON.stringify(b)).join(', ')}`,
        'A syntax error anywhere makes the whole record a permerror, so the valid mechanisms beside it stop counting too.',
      )
    }
    if (!/include:amazonses\.com/.test(record)) {
      fail(
        SEND,
        'SPF does not include amazonses.com',
        'Resend sends over Amazon SES. Without the include, every message fails SPF at the return-path.',
      )
    }
    if (!/[~-]all\s*$/.test(record.trim())) {
      fail(
        SEND,
        'SPF does not end in ~all or -all',
        'A record ending in +all or nothing tells receivers any host may send as this domain.',
      )
    }
  }
}

async function checkDkim() {
  const records = await txt(DKIM)

  if (records.length === 0) {
    fail(
      DKIM,
      'no DKIM record',
      'Without DKIM nothing survives forwarding, and DMARC has only SPF to align.',
    )
    return
  }
  if (records.length > 1) {
    fail(
      DKIM,
      `${records.length} TXT records at one selector`,
      'RFC 6376 leaves the choice to the verifier, so some receivers will pick the wrong one. Exactly one record per selector.',
    )
  }

  for (const record of records) {
    if (record.includes('[') || record.includes('...')) {
      fail(
        DKIM,
        `key contains a placeholder: ${record.slice(0, 40)}...`,
        'This is a truncated paste, not a key. Signatures verified against it fail.',
      )
      continue
    }
    const key = /p=([A-Za-z0-9+/=]*)/.exec(record)?.[1] ?? ''
    if (key.length === 0) {
      fail(
        DKIM,
        'DKIM record has an empty p=',
        'An empty p= is the RFC 6376 way to say the key is REVOKED. Receivers treat every signature from it as a failure.',
      )
    } else if (key.length < 200) {
      fail(
        DKIM,
        `DKIM key is ${key.length} characters`,
        'A 1024-bit key base64-encodes to roughly 216 characters and a 2048-bit one to about 392. Anything much shorter is truncated.',
      )
    }
  }
}

async function checkDmarc() {
  const records = (await txt(DMARC)).filter((r) => r.toLowerCase().startsWith('v=dmarc1'))

  if (records.length === 0) {
    fail(
      DMARC,
      'no DMARC record',
      'Without one, a receiver has no instruction for a message that fails both SPF and DKIM.',
    )
    return
  }
  if (records.length > 1) {
    fail(DMARC, `${records.length} DMARC records`, 'More than one is treated as none at all.')
  }

  const record = records[0] ?? ''
  const policy = /\bp=(none|quarantine|reject)/.exec(record)?.[1]
  if (!policy) {
    fail(DMARC, 'DMARC has no p=', 'p is mandatory.')
  } else if (policy === 'none') {
    // Not a failure. p=none is the correct FIRST state, and moving to
    // quarantine before the reports are clean is how a business stops
    // delivering its own receipts.
    notes.push(
      `${DMARC}: p=none. Correct while warming up; it enforces nothing. Move to p=quarantine once rua reports show SPF and DKIM aligned for every legitimate source.`,
    )
  }
  if (!/\brua=/.test(record)) {
    fail(
      DMARC,
      'DMARC has no rua=',
      'With no reporting address nobody ever learns whether alignment works, and p=none without rua is a record that does nothing at all.',
    )
  }
}

async function checkMx() {
  try {
    const mx = await dns.resolveMx(SEND)
    if (!mx.some((r) => /feedback-smtp\..*\.amazonses\.com$/.test(r.exchange))) {
      fail(
        SEND,
        'MX does not point at Amazon SES feedback-smtp',
        'This is where bounces and complaints are delivered. Without it Resend cannot report either, and the suppression list never fills.',
      )
    }
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      fail(SEND, 'no MX record', 'Bounces and complaints have nowhere to go.')
    } else {
      throw error
    }
  }
}

async function main() {
  console.log(`email DNS check: ${DOMAIN}\n`)
  try {
    await Promise.all([checkSpf(), checkDkim(), checkDmarc(), checkMx()])
  } catch (error) {
    console.error(`could not resolve: ${error.message}`)
    process.exit(2)
  }

  for (const note of notes) console.log(`note  ${note}`)
  if (notes.length > 0) console.log('')

  if (findings.length === 0) {
    console.log('clean: SPF, DKIM, DMARC and the bounce MX are all present and well formed.')
    process.exit(0)
  }

  console.error(`${findings.length} defect(s):\n`)
  for (const finding of findings) {
    console.error(`  ${finding.where}`)
    console.error(`    ${finding.what}`)
    console.error(`    ${finding.why}\n`)
  }
  console.error('The records exactly as they must appear are in docs/EMAIL-DELIVERABILITY.md.')
  console.error('DNS for this domain is at Cloudflare; this repository cannot change it.')
  process.exit(1)
}

main()
