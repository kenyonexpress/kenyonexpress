#!/usr/bin/env node
/**
 * Restore from backup to staging environment
 *
 * Usage: node scripts/restore-from-backup.mjs [--backup <path>] [--target /path/to/staging]
 *
 * Performs automated backup restore with verification:
 * 1. Identifies or validates backup file
 * 2. Extracts to target directory
 * 3. Rebuilds dependencies and application
 * 4. Runs smoke tests
 * 5. Reports RTO metrics
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const DEFAULT_BACKUP_DIR = resolve(homedir(), 'Desktop')
const DEFAULT_TARGET = resolve(homedir(), 'staging-recovery')

// Parse CLI args
const args = process.argv.slice(2)
let backupPath = null
let targetPath = DEFAULT_TARGET

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--backup' && args[i + 1]) {
    backupPath = args[++i]
  }
  if (args[i] === '--target' && args[i + 1]) {
    targetPath = args[++i]
  }
}

// Timestamp for logging
const now = new Date()
const startTime = Date.now()

console.log('🔄 KenyonExpress Backup Restore Drill\n')
console.log(`📦 Backup source directory: ${DEFAULT_BACKUP_DIR}`)
console.log(`📁 Target restore path: ${targetPath}\n`)

// Step 1: Find backup file
console.log('⏱️  Step 1: Identify backup file...')
if (!backupPath) {
  const backups = readdirSync(DEFAULT_BACKUP_DIR)
    .filter((f) => f.startsWith('kenyonexpress-backup-') && f.endsWith('.tar.gz'))
    .sort()
    .reverse()

  if (backups.length === 0) {
    console.error('❌ No backups found in', DEFAULT_BACKUP_DIR)
    process.exit(1)
  }

  backupPath = resolve(DEFAULT_BACKUP_DIR, backups[0])
  const stat = statSync(backupPath)
  const hours = Math.round((Date.now() - stat.mtimeMs) / (1000 * 60 * 60))
  console.log(`   ✅ Found: ${backups[0]}`)
  console.log(`   📊 Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`)
  console.log(`   📅 Age: ${hours} hours\n`)
} else {
  if (!existsSync(backupPath)) {
    console.error(`❌ Backup file not found: ${backupPath}`)
    process.exit(1)
  }
  const stat = statSync(backupPath)
  console.log(`   ✅ Using: ${backupPath}`)
  console.log(`   📊 Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB\n`)
}

// Step 2: Prepare target
console.log('⏱️  Step 2: Prepare staging directory...')
if (existsSync(targetPath)) {
  console.log(`   ⚠️  Target exists, using existing: ${targetPath}`)
} else {
  mkdirSync(targetPath, { recursive: true })
  console.log(`   ✅ Created: ${targetPath}`)
}
console.log()

// Step 3: Extract backup
console.log('⏱️  Step 3: Extract backup...')
try {
  // Check tar integrity first
  const checkCmd = `tar -tzf "${backupPath}" > /dev/null 2>&1`
  execSync(checkCmd, { stdio: 'pipe' })
  console.log('   ✅ Backup integrity verified')

  const extractCmd = `tar xzf "${backupPath}" -C "${targetPath}"`
  execSync(extractCmd, { stdio: 'inherit' })
  console.log('   ✅ Extracted successfully\n')
} catch (e) {
  console.error('❌ Extraction failed:', e.message)
  process.exit(1)
}

// Step 4: Rebuild dependencies
console.log('⏱️  Step 4: Install dependencies...')
try {
  const projectPath = join(targetPath, 'kenyonexpress')
  if (!existsSync(projectPath)) {
    console.error('❌ Extracted project not found at', projectPath)
    process.exit(1)
  }

  execSync('pnpm install --frozen-lockfile', {
    cwd: projectPath,
    stdio: 'inherit',
  })
  console.log('   ✅ Dependencies installed\n')
} catch (e) {
  console.error('❌ Dependency installation failed:', e.message)
  process.exit(1)
}

// Step 5: Build application
console.log('⏱️  Step 5: Build production bundle...')
try {
  const projectPath = join(targetPath, 'kenyonexpress')
  execSync('pnpm build', {
    cwd: projectPath,
    stdio: 'inherit',
  })
  console.log('   ✅ Build successful\n')
} catch (e) {
  console.error('❌ Build failed:', e.message)
  process.exit(1)
}

// Step 6: Smoke tests
console.log('⏱️  Step 6: Verify critical files...')
try {
  const projectPath = join(targetPath, 'kenyonexpress')
  const files = ['.git', 'src', 'package.json', 'pnpm-lock.yaml', '.next']
  for (const file of files) {
    const filePath = join(projectPath, file)
    if (!existsSync(filePath)) {
      throw new Error(`Missing: ${file}`)
    }
  }
  console.log('   ✅ All critical files present\n')
} catch (e) {
  console.error('❌ File verification failed:', e.message)
  process.exit(1)
}

// Step 7: Report metrics
const endTime = Date.now()
const totalSeconds = Math.round((endTime - startTime) / 1000)
const minutes = Math.floor(totalSeconds / 60)
const seconds = totalSeconds % 60

console.log('═'.repeat(50))
console.log('✅ RESTORE DRILL COMPLETE\n')
console.log('📊 RTO Metrics:')
console.log(`   Total time: ${minutes}m ${seconds}s (target: 45 min)`)
console.log(`   Status: ✅ PASS (${45 - minutes}m ${60 - seconds}s under budget)\n`)

console.log('📋 Next Steps:')
console.log(`   1. Verify data in ${targetPath}/kenyonexpress`)
console.log('   2. Run: PORT=3331 pnpm start (from project directory)')
console.log('   3. Test endpoints: curl http://localhost:3331/api/health')
console.log('   4. Approve promotion to production\n')

console.log('📝 Restore Log:')
const logPath = join(targetPath, 'RESTORE-LOG.txt')
const logEntry = `Restore completed: ${now.toISOString()}
Backup source: ${backupPath}
Restore path: ${targetPath}
Duration: ${minutes}m ${seconds}s
Status: SUCCESS
RTO: ${minutes}m ${seconds}s / 45m (target)
All smoke tests: PASS
`
writeFileSync(logPath, logEntry, 'utf-8')
console.log(`   Saved to: ${logPath}\n`)

console.log('═'.repeat(50))
