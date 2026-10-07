#!/usr/bin/env node
/**
 * Point-in-time recovery on the hosted Supabase project: see it, or turn it on.
 *
 *   node scripts/dr/pitr.mjs [--status] [--keychain] [--json]
 *   node scripts/dr/pitr.mjs --enable [--variant=pitr_7] --yes [--keychain]
 *
 * --status (default) prints pitr_enabled, WAL archiving, the newest platform
 * backup, the compute tier and the PITR price list, straight from the
 * management API. Read-only.
 *
 * --enable PATCHes /v1/projects/{ref}/billing/addons in the order
 * scripts/dr/pitr-lib.mjs plans: Small compute first when the project is
 * below Supabase's PITR floor, then the PITR variant. Both are RECURRING
 * CHARGES on the organisation's card (measured 2026-10-08: $15/mo + $100/mo
 * for pitr_7), so it refuses without --yes and prints the plan and the
 * monthly total before touching anything. Token: SUPABASE_ACCESS_TOKEN, or
 * the CLI keychain entry with --keychain.
 */

import { DEFAULT_PITR_VARIANT, pitrStatus, planPitrEnable } from './pitr-lib.mjs'
import {
  addonsPath,
  backupsPath,
  managementToken,
  mgmtGet,
  mgmtPatch,
  projectRef,
} from './supabase-mgmt.mjs'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const opt = (name, fallback) =>
  argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback

const fail = (msg) => {
  console.error(`error ${msg}`)
  process.exit(1)
}

const token = managementToken(process.env, { allowKeychain: has('--keychain') })
if (!token)
  fail(
    'no SUPABASE_ACCESS_TOKEN in env (or pass --keychain on a Mac with the Supabase CLI logged in)',
  )
const ref = projectRef()

const [backups, addons] = await Promise.all([
  mgmtGet(token, backupsPath(ref)),
  mgmtGet(token, addonsPath(ref)),
])
const status = pitrStatus({ backups, addons })

if (!has('--enable')) {
  if (has('--json')) {
    console.log(JSON.stringify(status, null, 2))
  } else {
    console.log(`project ${ref} (${status.region ?? 'region unknown'})`)
    console.log(
      `pitr_enabled: ${status.pitrEnabled}${status.pitrVariant ? ` (${status.pitrVariant})` : ''}`,
    )
    console.log(`walg_enabled: ${status.walgEnabled}`)
    console.log(
      `platform backups: ${status.completedBackups} completed, newest ${status.newestPlatformBackupAgeHours ?? 'n/a'}h old`,
    )
    console.log(`compute: ${status.computeVariant} (meets PITR floor: ${status.computeMeetsFloor})`)
    for (const v of status.pitrVariantsAvailable) console.log(`  ${v.id}: ${v.price}`)
    if (!status.pitrEnabled) {
      const plan = planPitrEnable({ addons, variant: DEFAULT_PITR_VARIANT })
      console.log(
        `to enable: node scripts/dr/pitr.mjs --enable --variant=${DEFAULT_PITR_VARIANT} --yes  (~$${plan.monthlyUsd}/month, ${plan.steps.length} add-on change${plan.steps.length === 1 ? '' : 's'})`,
      )
    }
  }
  process.exit(0)
}

const variant = opt('--variant', DEFAULT_PITR_VARIANT)
const plan = planPitrEnable({ addons, variant })
if (plan.steps.length === 0) {
  console.log(`ok PITR already enabled at ${variant}; nothing to do`)
  process.exit(0)
}
console.log(`plan for ${ref} (~$${plan.monthlyUsd}/month recurring):`)
for (const s of plan.steps) {
  console.log(
    `  PATCH ${addonsPath(ref)} ${JSON.stringify({ addon_type: s.addon_type, addon_variant: s.addon_variant })}  ${s.reason}`,
  )
}
if (!has('--yes')) fail('refusing to buy add-ons without --yes (these are recurring charges)')

for (const s of plan.steps) {
  await mgmtPatch(token, addonsPath(ref), {
    addon_type: s.addon_type,
    addon_variant: s.addon_variant,
  })
  console.log(`ok applied ${s.addon_type}=${s.addon_variant}`)
}
const after = pitrStatus({
  backups: await mgmtGet(token, backupsPath(ref)),
  addons: await mgmtGet(token, addonsPath(ref)),
})
console.log(
  `pitr_enabled now: ${after.pitrEnabled}${after.pitrVariant ? ` (${after.pitrVariant})` : ''}`,
)
if (!after.pitrEnabled) {
  console.error(
    '.. the add-on was accepted but pitr_enabled is still false; Supabase enables it asynchronously, re-run --status in a few minutes',
  )
}
