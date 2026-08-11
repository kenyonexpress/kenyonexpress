# ARCHITECTURE-BACKUP-DR.md

KenyonExpress **Backup & Disaster Recovery** architecture (binding).

Status: BINDING for `arch/backup-dr` (2026-07-30)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch-dr` only. **Documentation + scripts (contract).** Application code not applied in this commit.
Companions: `docs/ARCHITECTURE-PRODUCTION-OPS.md` §4.4-6, money ledger / Cardcom runbooks, R2 (`src/lib/storage/r2.ts`).

Stack: Supabase Postgres + Auth + (optional) Storage, Cloudflare R2 for product images, Vercel for Next.js, GitHub Actions for scheduled dumps, local encrypted bundles under `/Users/ofir/kenyonexpress-web/backups/` (never inside the app git root as tracked secrets).

Confirm live Supabase plan pricing / PITR SKU on the dashboard before budgeting; numbers below are planning anchors from PRODUCTION-OPS and may change.

---

## 0. Red lines

1. **No commercial charge on Supabase Free.** Free has **no** daily backups and **no** PITR. A wiped project = permanent data loss.
2. **Supabase Pro is mandatory before the first real Cardcom capture** (daily backups + no idle pause).
3. **Offsite `pg_dump` runs even on Pro.** Platform backups are necessary but not sufficient (account lockout, region issue, bad migration).
4. Backups contain **PII and money**. Encrypt at rest, restrict IAM, never commit dump files to the app repo.
5. Restore is not real until a **quarterly drill** proved RTO/RPO on a scratch project.
6. Vercel rollback restores **code**, not the database. Always pair deploy rollback with a DB decision.

---

## 1. What we protect

| Asset | System of record | Backup channel |
|---|---|---|
| Postgres (orders, vouchers, ledger, RLS, migrations history) | Supabase | Platform daily (+ PITR) + offsite `pg_dump` |
| Auth users | Supabase Auth (same project) | Included in logical dump of `auth` schema when using service connection / dashboard backup; verify in drill |
| Product images | **R2** (primary); Supabase Storage fallback | R2 versioning / second-bucket sync; optional `rclone` |
| App code + migrations | GitHub `kenyonexpress` | Git (already); release tags |
| Env / secrets | Vercel + 1Password / sealed store | Manual export checklist (not in git) |
| Edge config / DNS | Vercel + registrar | Documented; screenshot / zone export |

Out of scope for this doc: laptop disk images, WP legacy DB (separate cutover archive).

---

## 2. Supabase: Free vs Pro daily vs PITR

### 2.1 Tier matrix (binding policy)

| Capability | Free | Pro (base) | Pro + PITR add-on |
|---|---|---|---|
| Automatic daily backup | **None** | Yes (typically **7 days** retention) | Yes |
| Point-in-Time Recovery | **None** | No (add-on) | Yes (retention per SKU; often days of WAL) |
| Project pause when idle | Yes (risk) | No | No |
| Allowed for live payments | **Forbidden** | Required minimum | Recommended when GMV grows |

Policy:

| Phase | Required |
|---|---|
| Dev / local only | Free OK |
| Staging with fake money | Pro preferred |
| Production with real charges | **Pro mandatory** |
| Sustained real volume / strict RPO | **Pro + PITR** |

### 2.2 When PITR is worth it

Enable PITR when any of:

1. Daily paid order volume is material and a **bad migration** could corrupt hours of data that daily midnight backup cannot surgically undo.
2. RPO target drops below **24h** (see §5).
3. Finance requires restore-to-timestamp for dispute / audit.

Until PITR: rely on **daily offsite dumps** (RPO ≈ 24h worst case) + avoid destructive migrations without expand/contract.

### 2.3 Platform restore (dashboard)

Documented path (verify UI labels each quarter):

1. Supabase Dashboard → Project → Database → Backups.
2. Choose daily backup (or PITR timestamp).
3. Restore to **new** project when possible (safer than in-place).
4. Re-point Vercel env `NEXT_PUBLIC_SUPABASE_URL` / keys → redeploy.
5. Run smoke tests (§8).

Never practice first restore on production.

---

## 3. RTO / RPO targets (numeric)

| Scenario | RPO (max data loss) | RTO (max downtime) | Primary tool |
|---|---|---|---|
| Accidental row delete / bad SQL (Pro+PITR) | ≤ **15 minutes** | ≤ **2 hours** | PITR to new project |
| Accidental row delete (Pro, no PITR) | ≤ **24 hours** | ≤ **4 hours** | Previous daily backup / last `pg_dump` |
| Full project loss / region | ≤ **24 hours** (dump) | ≤ **8 hours** | Offsite dump → new project |
| Bad Next.js deploy only | **0** DB loss | ≤ **15 minutes** | Vercel rollback |
| R2 image corruption | ≤ **24 hours** (sync lag) | ≤ **4 hours** | Second bucket / version restore |
| Free tier prod (forbidden) | **unbounded** | **unbounded** | N/A (do not operate) |

Soft goal after PITR + runbooks mature: RPO ≤ 1h, RTO ≤ 2h for DB-only incidents.

---

## 4. Backup topology

```
                    ┌─────────────────────┐
                    │  Supabase Pro       │
                    │  daily backup 7d    │
                    │  (+ optional PITR)  │
                    └─────────┬───────────┘
                              │
                         pg_dump daily
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     Local encrypted    Cloud object     Weekly git
     dir (Mac/NAS)      (R2/S3/B2)       bundle (meta)
     30d retention      30-90d           8-12 weeks
```

Layers:

1. **Platform** (Supabase): fast, vendor-managed.
2. **Daily logical dump** (GitHub Action → cloud): survives Supabase account issues.
3. **Weekly encrypted git bundle of dumps index + checksums** (local + cloud copy): offline carry / air-gap style recovery of *backup catalog*, not a substitute for the dump blobs themselves.
4. **R2 image sync**: separate from SQL.

---

## 5. Offsite Postgres dump

### 5.1 Tooling

- `pg_dump` custom format (`-Fc`) for parallel restore (`pg_restore -j`).
- Prefer **direct DB connection string** from Supabase (Settings → Database) with SSL.
- Use a **read-only** role if available; otherwise restrict dump credentials to CI OIDC / short-lived secrets.

Schemas to include explicitly in drills: `public`, `auth`, `storage` (if used), extensions.

### 5.2 Directory layout (local)

```
/Users/ofir/kenyonexpress-web/backups/
  postgres/
    2026-07-30/
      kenyonexpress-2026-07-30T0300Z.dump
      kenyonexpress-2026-07-30T0300Z.dump.sha256
      kenyonexpress-2026-07-30T0300Z.dump.age   # encrypted
    latest -> 2026-07-30/
  r2-sync/
    ...
  bundles/
    backup-catalog-2026-W31.bundle
  RESTORE-LOG.md
```

Add to global ignore / never track under
`kenyonexpress/.git`.

### 5.3 Script: daily dump (full)

```bash
#!/usr/bin/env bash
# scripts/dr/pg-dump-daily.sh
# Usage: DATABASE_URL=... ./scripts/dr/pg-dump-daily.sh
# Optional: AGE_RECIPIENT=age1... for age encryption
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL required}"

STAMP="$(date -u +%Y-%m-%dT%H%MZ)"
DAY="$(date -u +%Y-%m-%d)"
ROOT="${BACKUP_ROOT:-/Users/ofir/kenyonexpress-web/backups/postgres}"
OUT_DIR="${ROOT}/${DAY}"
mkdir -p "${OUT_DIR}"

BASE="kenyonexpress-${STAMP}"
DUMP_PATH="${OUT_DIR}/${BASE}.dump"
SHA_PATH="${DUMP_PATH}.sha256"

echo "==> dumping to ${DUMP_PATH}"
pg_dump \
  --dbname="${DATABASE_URL}" \
  --format=custom \
  --no-owner \
  --no-acl \
  --verbose \
  --file="${DUMP_PATH}"

shasum -a 256 "${DUMP_PATH}" | tee "${SHA_PATH}"

if [[ -n "${AGE_RECIPIENT:-}" ]]; then
  if ! command -v age >/dev/null; then
    echo "age not installed; skipping encryption" >&2
  else
    age -r "${AGE_RECIPIENT}" -o "${DUMP_PATH}.age" "${DUMP_PATH}"
    # Prefer retaining only encrypted copy off-machine
    if [[ "${KEEP_PLAINTEXT:-0}" != "1" ]]; then
      rm -f "${DUMP_PATH}"
      echo "==> plaintext removed; kept ${DUMP_PATH}.age"
    fi
  fi
fi

ln -sfn "${DAY}" "${ROOT}/latest"
echo "==> done ${STAMP}"
```

### 5.4 Script: upload dump to cloud (R2/S3)

```bash
#!/usr/bin/env bash
# scripts/dr/upload-dump-r2.sh
# Requires: aws CLI configured for R2 (endpoint URL) OR rclone remote `ke-backups`
set -euo pipefail

DAY="$(date -u +%Y-%m-%d)"
ROOT="${BACKUP_ROOT:-/Users/ofir/kenyonexpress-web/backups/postgres}/${DAY}"
REMOTE_PREFIX="${REMOTE_PREFIX:-postgres/${DAY}}"

if [[ ! -d "${ROOT}" ]]; then
  echo "missing ${ROOT}" >&2
  exit 1
fi

if command -v rclone >/dev/null && [[ -n "${RCLONE_REMOTE:-}" ]]; then
  rclone copy "${ROOT}" "${RCLONE_REMOTE}:${REMOTE_PREFIX}" --checksum -v
elif [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${R2_ENDPOINT:-}" && -n "${BACKUP_BUCKET:-}" ]]; then
  aws s3 sync "${ROOT}" "s3://${BACKUP_BUCKET}/${REMOTE_PREFIX}" \
    --endpoint-url "${R2_ENDPOINT}" \
    --only-show-errors
else
  echo "configure rclone RCLONE_REMOTE or AWS+R2_ENDPOINT+BACKUP_BUCKET" >&2
  exit 1
fi

echo "==> uploaded ${ROOT}"
```

### 5.5 GitHub Action (daily)

```yaml
# .github/workflows/dr-pg-dump.yml
name: dr-pg-dump
on:
  schedule:
    - cron: '0 3 * * *' # 03:00 UTC daily
  workflow_dispatch:

jobs:
  dump:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Install pg_dump
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client age

      - name: Dump
        env:
          DATABASE_URL: ${{ secrets.SUPABASE_DB_URL }}
          AGE_RECIPIENT: ${{ secrets.BACKUP_AGE_RECIPIENT }}
          BACKUP_ROOT: ${{ runner.temp }}/postgres
          KEEP_PLAINTEXT: '0'
        run: |
          chmod +x scripts/dr/pg-dump-daily.sh
          ./scripts/dr/pg-dump-daily.sh

      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.BACKUP_R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.BACKUP_R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          R2_ENDPOINT: ${{ secrets.BACKUP_R2_ENDPOINT }}
          BACKUP_BUCKET: ${{ secrets.BACKUP_BUCKET }}
          BACKUP_ROOT: ${{ runner.temp }}/postgres
        run: |
          DAY=$(date -u +%Y-%m-%d)
          chmod +x scripts/dr/upload-dump-r2.sh
          # sync expects BACKUP_ROOT/DAY; align with dump layout
          export BACKUP_ROOT="${BACKUP_ROOT}"
          # upload-dump-r2 uses BACKUP_ROOT/DAY; set ROOT via day folder:
          ROOT="${BACKUP_ROOT}/${DAY}"
          aws s3 sync "${ROOT}" "s3://${BACKUP_BUCKET}/postgres/${DAY}" \
            --endpoint-url "${R2_ENDPOINT}"

      - name: Notify on failure
        if: failure()
        run: |
          curl -sS -H "Title: KE pg_dump FAILED" \
            -d "Daily Postgres dump failed on ${{ github.run_id }}" \
            "ntfy.sh/${{ secrets.NTFY_TOPIC }}" || true
```

Secrets (GitHub): `SUPABASE_DB_URL`, `BACKUP_AGE_RECIPIENT`, `BACKUP_R2_*`, `BACKUP_BUCKET`, `NTFY_TOPIC`.

### 5.6 Retention

| Store | Retention |
|---|---|
| Local plaintext/encrypted dumps | 30 days |
| Cloud object dumps | 90 days (lifecycle rule) |
| Supabase daily | 7 days (Pro default) |
| PITR window | per add-on |
| Weekly bundles | 12 weeks |

```bash
#!/usr/bin/env bash
# scripts/dr/prune-local-dumps.sh
set -euo pipefail
ROOT="${BACKUP_ROOT:-/Users/ofir/kenyonexpress-web/backups/postgres}"
KEEP_DAYS="${KEEP_DAYS:-30}"
find "${ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime "+${KEEP_DAYS}" -print -exec rm -rf {} +
```

---

## 6. Weekly git bundle (catalog + checksums)

Purpose: an offline, append-only **catalog** of what exists (filenames + sha256 + restore notes), plus optional small metadata. Large `.dump` / `.age` files stay in object storage, not in git history.

### 6.1 Catalog repo (separate)

```
/Users/ofir/kenyonexpress-web/backup-catalog/   # separate git repo, private
  README.md
  checksums/
    2026-07-30.sha256
  manifests/
    2026-W31.json
  RESTORE-LOG.md
```

Never put DB connection strings in this repo.

### 6.2 Manifest writer

```bash
#!/usr/bin/env bash
# scripts/dr/write-weekly-manifest.sh
set -euo pipefail

WEEK="$(date -u +%Y-W%V)"
DAY="$(date -u +%Y-%m-%d)"
PG_ROOT="${BACKUP_ROOT:-/Users/ofir/kenyonexpress-web/backups/postgres}"
CATALOG="${CATALOG_ROOT:-/Users/ofir/kenyonexpress-web/backup-catalog}"
mkdir -p "${CATALOG}/checksums" "${CATALOG}/manifests"

MANIFEST="${CATALOG}/manifests/${WEEK}.json"
{
  echo '{'
  echo "  \"week\": \"${WEEK}\","
  echo "  \"generated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo '  \"objects\": ['
  first=1
  find "${PG_ROOT}" -type f \( -name '*.dump' -o -name '*.age' -o -name '*.sha256' \) | sort | while read -r f; do
    rel="${f#"${PG_ROOT}"/}"
    sum="$(shasum -a 256 "${f}" | awk '{print $1}')"
    size="$(wc -c <"${f}" | tr -d ' ')"
    if [[ ${first} -eq 0 ]]; then echo ','; fi
    first=0
    printf '    {"path":"%s","sha256":"%s","bytes":%s}' "${rel}" "${sum}" "${size}"
  done
  echo
  echo '  ]'
  echo '}'
} > "${MANIFEST}"

# Flatten checksums for the day
find "${PG_ROOT}/${DAY}" -name '*.sha256' -exec cat {} + > "${CATALOG}/checksums/${DAY}.sha256" || true

echo "==> wrote ${MANIFEST}"
```

### 6.3 Create git bundle

```bash
#!/usr/bin/env bash
# scripts/dr/weekly-git-bundle.sh
set -euo pipefail

CATALOG="${CATALOG_ROOT:-/Users/ofir/kenyonexpress-web/backup-catalog}"
BUNDLE_DIR="${BUNDLE_DIR:-/Users/ofir/kenyonexpress-web/backups/bundles}"
WEEK="$(date -u +%Y-W%V)"
mkdir -p "${BUNDLE_DIR}"

cd "${CATALOG}"
git add -A
git commit -m "catalog ${WEEK}" || true
BUNDLE="${BUNDLE_DIR}/backup-catalog-${WEEK}.bundle"
git bundle create "${BUNDLE}" --all
shasum -a 256 "${BUNDLE}" | tee "${BUNDLE}.sha256"

# Optional: encrypt bundle for USB / offsite
if [[ -n "${AGE_RECIPIENT:-}" ]] && command -v age >/dev/null; then
  age -r "${AGE_RECIPIENT}" -o "${BUNDLE}.age" "${BUNDLE}"
fi

# Upload bundle to cloud
if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  rclone copy "${BUNDLE_DIR}" "${RCLONE_REMOTE}:bundles/" --include "backup-catalog-${WEEK}.*"
fi

echo "==> bundle ${BUNDLE}"
```

### 6.4 Restore catalog from bundle

```bash
#!/usr/bin/env bash
# scripts/dr/clone-from-bundle.sh
set -euo pipefail
BUNDLE="${1:?path to .bundle}"
DEST="${2:-/Users/ofir/kenyonexpress-web/backup-catalog-restored}"
git clone "${BUNDLE}" "${DEST}"
echo "==> catalog at ${DEST}"
```

Weekly schedule (local launchd or GH cron weekly):

```yaml
# .github/workflows/dr-weekly-bundle.yml
on:
  schedule:
    - cron: '30 4 * * 0' # Sunday 04:30 UTC
  workflow_dispatch:
```

(Runner still needs access to checksum files; simplest: generate manifest in the same daily job and commit to a private `backup-catalog` repo via deploy key.)

---

## 7. Storage / image backup (R2 + Supabase Storage)

### 7.1 R2 (primary images)

Binding:

1. Enable **object versioning** on the production images bucket (or keep immutable keys only, per performance arch).
2. Second bucket `ke-images-backup` in **another account or region** if Cloudflare supports; else nightly `rclone sync` to Backblaze/S3.
3. Do not rely on git for binaries.

```bash
#!/usr/bin/env bash
# scripts/dr/sync-r2-images.sh
set -euo pipefail
: "${RCLONE_SRC:?e.g. r2prod:kenyon-images}"
: "${RCLONE_DST:?e.g. b2:ke-images-backup}"

rclone sync "${RCLONE_SRC}" "${RCLONE_DST}" \
  --fast-list \
  --checksum \
  --transfers 8 \
  --log-file="/Users/ofir/kenyonexpress-web/backups/r2-sync/rclone-$(date -u +%Y%m%d).log" \
  -v

echo "==> r2 sync done"
```

### 7.2 Supabase Storage fallback

If any assets still live in Supabase Storage:

```bash
#!/usr/bin/env bash
# scripts/dr/supabase-storage-mirror.sh
# Uses supabase CLI or S3-compatible Storage API
set -euo pipefail
: "${SUPABASE_PROJECT_REF:?}"
: "${SUPABASE_SERVICE_ROLE_KEY:?}"
DEST="${DEST:-/Users/ofir/kenyonexpress-web/backups/supabase-storage}"
mkdir -p "${DEST}"

# Example with supabase CLI (adjust bucket list):
for bucket in product-images avatars; do
  mkdir -p "${DEST}/${bucket}"
  npx supabase storage cp -r "ss:///${bucket}" "${DEST}/${bucket}" \
    --project-ref "${SUPABASE_PROJECT_REF}" || true
done
```

Prefer listing buckets from dashboard and mirroring with rclone S3 compatibility if enabled.

### 7.3 `media_assets` table

SQL dump already includes `media_assets` rows (URLs/keys). After DB restore, verify every key exists in R2; script a dangling-key report:

```sql
-- run on restored DB
SELECT id, storage_key, public_url
FROM media_assets
WHERE deleted_at IS NULL
LIMIT 100;
```

---

## 8. Full restore runbook (step-by-step)

**Goal:** empty scratch Supabase project → app serves catalog + can read orders from restored dump.

### 8.0 Preconditions

- [ ] Operator has Age private key / access to encrypted dumps
- [ ] New Supabase project created on **Pro**
- [ ] Vercel preview env ready (do not repoint production until smoke pass)
- [ ] Cardcom left on **test** or paused webhooks during drill

### 8.1 Obtain dump

```bash
# From cloud
aws s3 cp s3://$BACKUP_BUCKET/postgres/2026-07-30/kenyonexpress-XXXX.dump.age ./ --endpoint-url $R2_ENDPOINT
age -d -i ~/.config/age/ke-backup.txt -o restore.dump kenyonexpress-XXXX.dump.age
shasum -a 256 -c kenyonexpress-XXXX.dump.sha256
```

### 8.2 Create target database

1. Create project `kenyonexpress-dr-YYYYMMDD`.
2. Set a strong DB password; save `DATABASE_URL`.
3. Enable required extensions if `pg_restore` does not (usually dump includes them).

### 8.3 Restore

```bash
#!/usr/bin/env bash
# scripts/dr/pg-restore.sh
set -euo pipefail
: "${TARGET_DATABASE_URL:?}"
: "${DUMP_FILE:?}"

# Optional: wipe public schema on empty project first if re-running
# psql "$TARGET_DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

pg_restore \
  --dbname="${TARGET_DATABASE_URL}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --jobs=4 \
  --verbose \
  "${DUMP_FILE}"

echo "==> restore finished (review errors: concurrent drop noise is common)"
```

Known issues to expect and triage:

- Ownership / role name mismatches (`--no-owner` mitigates)
- Extension privileges
- `auth` schema conflicts if project already initialized Auth differently

**Auth note:** Restoring `auth.users` into a fresh project may conflict with Supabase-managed Auth. Drill two modes:

| Mode | Use |
|---|---|
| A. Full logical including `auth` | Closest to prod; may need support docs / careful order |
| B. `public` only + re-invite users | Faster app bring-up; unacceptable for true DR of accounts |

Production DR aims for **Mode A** after one successful quarterly practice.

### 8.4 Repoint application (preview first)

```bash
# Vercel: set preview env
NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=... # if used by scripts
```

Redeploy preview. Do **not** change production DNS yet.

### 8.5 Smoke checklist

```bash
#!/usr/bin/env bash
# scripts/dr/smoke-after-restore.sh
set -euo pipefail
BASE="${1:?https://preview-url}"

curl -fsS "$BASE/api/health" | tee /tmp/ke-health.json
curl -fsS -o /dev/null -w "%{http_code}\n" "$BASE/"
curl -fsS -o /dev/null -w "%{http_code}\n" "$BASE/products"

echo "Manual:"
echo "1) Login with a restored user"
echo "2) Open an order + voucher QR"
echo "3) Admin analytics loads"
echo "4) Cardcom webhook endpoint rejects bad sig"
```

SQL checks:

```sql
SELECT count(*) FROM orders WHERE paid_at IS NOT NULL;
SELECT count(*) FROM vouchers WHERE status = 'issued';
SELECT count(*) FROM order_items;
SELECT max(paid_at) FROM orders;
```

Compare `max(paid_at)` to dump timestamp (RPO evidence).

### 8.6 Cutover (real incident)

1. Put storefront in maintenance (Vercel middleware flag / DNS).
2. Final dump from dying primary if still readable.
3. Restore to new project (or PITR).
4. Update **production** Vercel env → redeploy.
5. Update webhook URLs at Cardcom to production host if project URL changed (usually host unchanged; Supabase URL changes).
6. Re-enable traffic.
7. Write `backups/RESTORE-LOG.md` entry within 24h.

### 8.7 Vercel-only rollback (code)

When DB is fine and a bad deploy ships:

```bash
# List deployments
vercel ls kenyonexpress

# Promote previous production deployment
vercel rollback [deployment-url-or-id]
```

Or Dashboard → Deployments → ⋮ → Promote to Production.

Also keep git tag rollback:

```bash
git fetch origin
git checkout phase5/homepage
git revert <badsha>   # prefer revert over reset on shared branches
git push
```

**Never** `git push --force` to the production branch without explicit owner approval.

---

## 9. Quarterly restore drill

### 9.1 Cadence

| When | What |
|---|---|
| Every quarter (±1 week) | Full restore to scratch project + smoke |
| After any major migration series | Optional mini-drill (`public` only) |
| After enabling PITR | One PITR timestamp restore practice |

### 9.2 Scorecard (fill each drill)

```markdown
## DR drill YYYY-Qn

- Operator:
- Dump source (date / PITR ts):
- Measured RPO (prod max(paid_at) vs restored):
- Measured RTO (clock start → smoke green):
- Mode A auth restored? yes/no
- Image spot-check (5 PDP): pass/fail
- Issues:
- Follow-ups:
```

Target: RTO ≤ 8h, RPO ≤ 24h without PITR; improve after PITR.

### 9.3 Automation stub

```bash
#!/usr/bin/env bash
# scripts/dr/quarterly-drill.sh
set -euo pipefail
echo "1) Download latest .age from R2"
echo "2) Decrypt"
echo "3) Create supabase project manually (or API)"
echo "4) TARGET_DATABASE_URL=... DUMP_FILE=... ./scripts/dr/pg-restore.sh"
echo "5) ./scripts/dr/smoke-after-restore.sh https://..."
echo "6) Append scorecard to backups/RESTORE-LOG.md"
```

---

## 10. Monitoring & alerts

| Signal | Alert |
|---|---|
| GH Action `dr-pg-dump` fails | Ntfy / email immediately |
| Dump size drops >50% WoW | Manual investigate (empty dump) |
| Supabase status: outage / pause | Uptime + status subscribe |
| R2 sync job fails | Ntfy |
| No successful dump in 36h | Cron watchdog |

```bash
#!/usr/bin/env bash
# scripts/dr/watchdog-latest-dump.sh
set -euo pipefail
ROOT="${BACKUP_ROOT:-/Users/ofir/kenyonexpress-web/backups/postgres/latest}"
if [[ ! -d "${ROOT}" ]]; then
  echo "NO_LATEST_DIR"; exit 2
fi
# cloud watchdog should check object mtime via aws s3api head-object
```

---

## 11. Secrets & encryption

| Item | Store |
|---|---|
| Age key for dumps | 1Password + offline paper backup |
| DB URL for CI | GitHub Actions secret (restricted repo) |
| R2 backup keys | Separate from app `R2_*` if possible (least privilege: write-only to backup bucket) |
| Vercel rollback token | Owner laptop / Vercel SSO |

Rotation: quarterly with PRODUCTION-OPS secret rotation.

---

## 12. File map (implementation PR)

```
scripts/dr/pg-dump-daily.sh
scripts/dr/upload-dump-r2.sh
scripts/dr/prune-local-dumps.sh
scripts/dr/write-weekly-manifest.sh
scripts/dr/weekly-git-bundle.sh
scripts/dr/clone-from-bundle.sh
scripts/dr/pg-restore.sh
scripts/dr/sync-r2-images.sh
scripts/dr/supabase-storage-mirror.sh
scripts/dr/smoke-after-restore.sh
scripts/dr/quarterly-drill.sh
scripts/dr/watchdog-latest-dump.sh
.github/workflows/dr-pg-dump.yml
.github/workflows/dr-weekly-bundle.yml
docs/ARCHITECTURE-BACKUP-DR.md
```

Local (outside app git):

```
/Users/ofir/kenyonexpress-web/backups/
/Users/ofir/kenyonexpress-web/backup-catalog/
```

---

## 13. Go-live checklist

- [ ] Supabase project is **Pro** (not Free)
- [ ] Daily GH Action green for 7 consecutive days
- [ ] Encrypted dump downloadable from second cloud account
- [ ] R2 image sync job green
- [ ] One successful restore drill recorded in `RESTORE-LOG.md`
- [ ] Vercel rollback practiced once on preview
- [ ] Cardcom webhook URL documented for project-move case
- [ ] PITR decision dated (enable / defer with reason)
- [ ] Age key escrow tested (second person can decrypt)

---

## 14. Out of scope

- Multi-region active-active Postgres
- Instant customer-facing failover DNS (<1 min RTO)
- Backing up WordPress once cutover is done (archive cold)
- Legal retention holds (separate compliance export)

---

## 15. Revision

| Date | Change |
|---|---|
| 2026-07-30 | Initial binding Backup/DR architecture on `arch/backup-dr` |
