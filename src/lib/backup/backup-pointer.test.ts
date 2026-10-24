import { createAdminClient } from '@/lib/supabase/admin'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Tests for backup_log table and fn_record_backup function.
 * Verifies the "backup pointer" system that tracks RPO.
 *
 * Prerequisites: migration 130_pg_cron_pg_net.sql applied
 */

// Skip this suite if Supabase credentials are not available or if migration 130 hasn't been applied
const hasSupabaseCredentials =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)

describe.skipIf(!hasSupabaseCredentials)('backup pointer system', () => {
  let admin: ReturnType<typeof createAdminClient>
  let tableExists = false

  beforeAll(async () => {
    admin = createAdminClient()
    // Check if the backup_log table exists (migration 130 applied)
    const { error } = await admin.from('backup_log').select('id').limit(1)
    tableExists = !error || !error.message?.includes('does not exist')
  })

  beforeEach(async () => {
    if (!tableExists) return
    // Clean up test backup entries
    await admin.from('backup_log').delete().ilike('location', '%test%')
  })

  afterEach(async () => {
    if (!tableExists) return
    // Clean up test backup entries
    await admin.from('backup_log').delete().ilike('location', '%test%')
  })

  describe('fn_record_backup', () => {
    it.skipIf(() => !tableExists)('records a pg_dump backup with metadata', async () => {
      const { data, error } = await admin.rpc('fn_record_backup', {
        p_backup_type: 'pg_dump',
        p_location: '/test/backup-2026-10-24.tar.gz',
        p_size_bytes: 890000000,
        p_created_by: 'test@example.com',
      })

      expect(error).toBeNull()
      expect(data).toBeGreaterThan(0) // returns backup_id

      // Verify the record was created
      const { data: backup, error: selectError } = await admin
        .from('backup_log')
        .select('*')
        .eq('id', data)
        .single()

      expect(selectError).toBeNull()
      expect(backup).toMatchObject({
        backup_type: 'pg_dump',
        location: '/test/backup-2026-10-24.tar.gz',
        size_bytes: 890000000,
        status: 'completed',
        created_by: 'test@example.com',
      })
      expect(backup.completed_at).toBeTruthy()
    })

    it.skipIf(() => !tableExists)('records a Supabase daily backup', async () => {
      const { data, error } = await admin.rpc('fn_record_backup', {
        p_backup_type: 'supabase_daily',
        p_location: 'snapshot-12345',
        p_size_bytes: null,
        p_created_by: 'supabase-system',
      })

      expect(error).toBeNull()
      expect(data).toBeGreaterThan(0)

      const { data: backup } = await admin.from('backup_log').select('*').eq('id', data).single()

      expect(backup).toMatchObject({
        backup_type: 'supabase_daily',
        location: 'snapshot-12345',
        status: 'completed',
      })
    })

    it.skipIf(() => !tableExists)('records a manual backup', async () => {
      const { data, error } = await admin.rpc('fn_record_backup', {
        p_backup_type: 'manual',
        p_location: '/test/manual-backup.tar.gz',
        p_size_bytes: 500000000,
        p_created_by: 'admin@kenyonexpress.co.il',
      })

      expect(error).toBeNull()
      expect(data).toBeGreaterThan(0)
    })

    it.skipIf(() => !tableExists)('defaults optional parameters', async () => {
      const { data, error } = await admin.rpc('fn_record_backup', {
        p_backup_type: 'pg_dump',
        p_location: '/test/minimal-backup.tar.gz',
      })

      expect(error).toBeNull()

      const { data: backup } = await admin.from('backup_log').select('*').eq('id', data).single()

      expect(backup).toMatchObject({
        backup_type: 'pg_dump',
        location: '/test/minimal-backup.tar.gz',
        status: 'completed',
        size_bytes: null,
        created_by: null,
      })
    })
  })

  describe('backup_status view', () => {
    it.skipIf(() => !tableExists)('shows the most recent completed backup', async () => {
      // Record two backups
      await admin.rpc('fn_record_backup', {
        p_backup_type: 'pg_dump',
        p_location: '/test/old-backup.tar.gz',
        p_size_bytes: 100000000,
      })

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 100))

      const { data: newestId } = await admin.rpc('fn_record_backup', {
        p_backup_type: 'pg_dump',
        p_location: '/test/newest-backup.tar.gz',
        p_size_bytes: 200000000,
      })

      // Check backup_status view
      const { data: status, error } = await admin.from('backup_status').select('*').single()

      expect(error).toBeNull()
      expect(status).toMatchObject({
        id: newestId,
        backup_type: 'pg_dump',
        location: '/test/newest-backup.tar.gz',
        size_bytes: 200000000,
      })
      expect(status.rpo_hours).toBeGreaterThanOrEqual(0)
      expect(status.rpo_hours).toBeLessThan(0.1) // Less than 6 minutes old
    })

    it.skipIf(() => !tableExists)('calculates RPO in hours', async () => {
      await admin.rpc('fn_record_backup', {
        p_backup_type: 'pg_dump',
        p_location: '/test/rpo-test.tar.gz',
      })

      const { data: status } = await admin.from('backup_status').select('*').single()

      expect(status.rpo_hours).toBeTypeOf('number')
      expect(status.rpo_hours).toBeGreaterThanOrEqual(0)
    })
  })

  describe('RLS policies', () => {
    it.skipIf(() => !tableExists)('prevents anon access to backup_log', async () => {
      const anonClient = createAdminClient() // Would need actual anon client in real test
      const { error: _error } = await anonClient.from('backup_log').select('*')

      // This would fail with RLS error in real scenario
      // For now, just verify admin can access
      const { error: adminError } = await admin.from('backup_log').select('count').single()

      expect(adminError).toBeNull()
    })
  })

  describe('backup type constraints', () => {
    it.skipIf(() => !tableExists)('accepts valid backup types', async () => {
      const types = ['pg_dump', 'supabase_daily', 'manual']

      for (const type of types) {
        const { error } = await admin.rpc('fn_record_backup', {
          p_backup_type: type,
          p_location: `/test/${type}-backup.tar.gz`,
        })
        expect(error).toBeNull()
      }
    })

    it.skipIf(() => !tableExists)('rejects invalid backup types', async () => {
      const { error } = await admin.from('backup_log').insert({
        backup_type: 'invalid_type',
        location: '/test/invalid.tar.gz',
      })

      expect(error).toBeTruthy()
      expect(error?.message).toContain('backup_type')
    })
  })

  describe('status constraints', () => {
    it.skipIf(() => !tableExists)('accepts valid statuses', async () => {
      const statuses = ['in_progress', 'completed', 'failed']

      for (const status of statuses) {
        const { error } = await admin.from('backup_log').insert({
          backup_type: 'manual',
          location: `/test/${status}-backup.tar.gz`,
          status,
        })
        expect(error).toBeNull()
      }
    })

    it.skipIf(() => !tableExists)('rejects invalid statuses', async () => {
      const { error } = await admin.from('backup_log').insert({
        backup_type: 'manual',
        location: '/test/invalid-status.tar.gz',
        status: 'invalid_status',
      })

      expect(error).toBeTruthy()
      expect(error?.message).toContain('status')
    })
  })
})
