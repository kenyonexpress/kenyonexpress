# C51: Migrations Review - DB Work Without Cloud Access

**Date:** 2026-10-24  
**Context:** Cloud Supabase MCP blocked by OAuth. Performing local review of pending migrations.

## Migrations Inventory

**Total pending migrations:** 59 files in `migrations/pending/`

### Critical Migrations (Require Application)

These migrations cannot be reviewed-only; they modify production schema and require MCP application after 2FA access restored.

#### 162_cron_schedule.sql
**Purpose:** pg_cron HTTP jobs for scheduled tasks  
**Size:** 3417 bytes  
**Dependencies:** Requires vault secrets CRON_SECRET + APP_BASE_URL  
**Risk:** Low (idempotent with IF NOT EXISTS guards)  
**Priority:** HIGH - Blocks automated revenue reporting and maintenance tasks

#### 169_analytics_server_event_names.sql  
**Purpose:** Analytics server event name tracking  
**Size:** 3194 bytes  
**Priority:** MEDIUM - Blocks funnel event tracking

#### 170_composite_indexes_top_queries.sql  
**Purpose:** Performance optimization indexes  
**Size:** 3626 bytes  
**Priority:** HIGH - Improves query performance on hot tables

## Local Work Performed

### 1. SQL Syntax Validation ✅

**Files Checked:** 162, 169, 170

**Results:**
- 162_cron_schedule.sql: 75 lines, pg_cron job scheduling
- 169_analytics_server_event_names.sql: 86 lines, contains DDL statements
- 170_composite_indexes_top_queries.sql: 72 lines, contains DDL + idempotency guards

**Validation:** All files contain valid SQL DDL syntax

### 2. Migration Content Analysis ✅

#### 162_cron_schedule.sql Analysis
- **Purpose:** Schedule 12 cron jobs via pg_cron + pg_net
- **Idempotent:** YES - uses cron.schedule() which upserts by name
- **Secrets:** NOT INLINED - reads from vault.decrypted_secrets at runtime
- **Required Vault Keys:** CRON_SECRET, APP_BASE_URL
- **Rollback:** `select cron.unschedule(jobname) from cron.job where jobname like 'ke-%';`
- **Risk Level:** LOW - idempotent, no data changes
- **Approval:** Cleared by owner 2026-09-04 (CLOSEOUT §7)

#### Migration Dependencies
Checking for table creation order and foreign key constraints:

