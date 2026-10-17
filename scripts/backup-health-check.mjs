#!/usr/bin/env node
/**
 * Backup health check - validates backup strategy compliance
 *
 * Verifies:
 * - Latest backup exists and is accessible
 * - Backup freshness (RPO compliance: < 23 hours)
 * - Backup integrity (tar structure valid)
 * - Backup count (maintains 3 rolling backups)
 *
 * Exit codes:
 * 0 = All healthy
 * 1 = RPO exceeded or backup missing
 * 2 = Backup integrity issue
 */

import { execSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const BACKUP_DIR = resolve(homedir(), 'Desktop')
const RPO_HOURS = 23 // Recovery Point Objective
const MIN_BACKUP_COUNT = 3 // Keep at least 3 rolling backups
const MIN_BACKUP_SIZE_MB = 800 // Sanity check for backup size

const now = Date.now()
const alertTopic = 'ntfy.sh/kenyon-ofir-limit'

console.log('🔍 Backup Health Check\n')
console.log(`📁 Backup directory: ${BACKUP_DIR}`)
console.log(`⏱️  RPO threshold: ${RPO_HOURS} hours\n`)

// Find all backup files
const backups = readdirSync(BACKUP_DIR)
  .filter((f) => f.startsWith('kenyonexpress-backup-') && f.endsWith('.tar.gz'))
  .map((filename) => {
    const path = resolve(BACKUP_DIR, filename)
    const stat = statSync(path)
    const match = filename.match(/kenyonexpress-backup-(\d{4})-(\d{2})-(\d{2})-(\d{4})/)
    const backupDate = match
      ? new Date(
          `${match[1]}-${match[2]}-${match[3]}T${match[4].slice(0, 2)}:${match[4].slice(2, 4)}:00Z`,
        ).getTime()
      : 0

    return {
      filename,
      path,
      size: stat.size,
      mtime: stat.mtimeMs,
      backupDate: backupDate || stat.mtimeMs,
    }
  })
  .sort((a, b) => b.backupDate - a.backupDate)

if (backups.length === 0) {
  console.error('❌ CRITICAL: No backups found!')
  try {
    execSync(`curl -d "❌ CRITICAL: No KenyonExpress backups found" ${alertTopic}`, {
      stdio: 'pipe',
    })
  } catch {}
  process.exit(1)
}

// Check freshness (RPO)
console.log('📦 Backup Inventory:')
const newestBackup = backups[0]
const ageHours = (now - newestBackup.backupDate) / (1000 * 60 * 60)
const ageDays = ageHours / 24

for (let i = 0; i < Math.min(3, backups.length); i++) {
  const b = backups[i]
  const hours = (now - b.backupDate) / (1000 * 60 * 60)
  const status = hours < RPO_HOURS ? '✅' : '⚠️ '
  const sizeMB = (b.size / 1024 / 1024).toFixed(1)
  console.log(`   ${status} ${b.filename} (${sizeMB} MB, ${Math.round(hours)}h old)`)
}

console.log()

// RPO compliance
let rpoStatus = 'PASS'
if (ageHours > RPO_HOURS) {
  console.error(
    `⚠️  RPO EXCEEDED: Latest backup is ${Math.round(ageHours)}h old (limit: ${RPO_HOURS}h)`,
  )
  rpoStatus = 'FAIL'
}

// Backup count compliance
let countStatus = 'PASS'
if (backups.length < MIN_BACKUP_COUNT) {
  console.error(`⚠️  INSUFFICIENT BACKUPS: ${backups.length} found (need: ${MIN_BACKUP_COUNT})`)
  countStatus = 'FAIL'
} else {
  console.log(`✅ Backup count: ${backups.length} (minimum: ${MIN_BACKUP_COUNT})`)
}

console.log()

// Integrity checks
console.log('🔐 Integrity Checks:')
let integrityStatus = 'PASS'
for (let i = 0; i < Math.min(1, backups.length); i++) {
  const backup = backups[i]

  // Size check
  if (backup.size < MIN_BACKUP_SIZE_MB * 1024 * 1024) {
    console.error(
      `❌ ${backup.filename}: Size ${(backup.size / 1024 / 1024).toFixed(1)} MB is suspiciously small`,
    )
    integrityStatus = 'FAIL'
  } else {
    console.log(`   ✅ ${backup.filename}: Size ${(backup.size / 1024 / 1024).toFixed(1)} MB`)
  }

  // Tar integrity
  try {
    execSync(`tar -tzf "${backup.path}" > /dev/null 2>&1`)
    console.log(`   ✅ ${backup.filename}: Tar structure valid`)
  } catch (_e) {
    console.error(`❌ ${backup.filename}: Corrupt tar file!`)
    integrityStatus = 'FAIL'
  }
}

console.log()

// Summary
console.log('═'.repeat(50))
const allPass = rpoStatus === 'PASS' && countStatus === 'PASS' && integrityStatus === 'PASS'

if (allPass) {
  console.log('✅ BACKUP HEALTH: HEALTHY\n')
  console.log('📊 Metrics:')
  console.log(`   RPO: ${Math.round(ageHours)}h / ${RPO_HOURS}h ✅`)
  console.log(`   Backups: ${backups.length} / ${MIN_BACKUP_COUNT} ✅`)
  console.log(`   Latest: ${newestBackup.filename}`)
  console.log(`   Age: ${ageDays.toFixed(1)} days\n`)
  process.exit(0)
} else {
  console.log('⚠️  BACKUP HEALTH: DEGRADED\n')
  console.log('Issues found:')
  if (rpoStatus === 'FAIL') {
    console.log(`   ❌ RPO exceeded: ${Math.round(ageHours)}h > ${RPO_HOURS}h`)
  }
  if (countStatus === 'FAIL') {
    console.log(`   ❌ Insufficient backups: ${backups.length} < ${MIN_BACKUP_COUNT}`)
  }
  if (integrityStatus === 'FAIL') {
    console.log('   ❌ Backup integrity issues detected')
  }

  // Send alert
  const alertMsg = `⚠️ KenyonExpress backup health degraded: RPO=${Math.round(ageHours)}h, count=${backups.length}`
  try {
    execSync(`curl -d "${alertMsg}" ${alertTopic}`, { stdio: 'pipe' })
  } catch {}

  process.exit(1)
}
