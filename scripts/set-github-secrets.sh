#!/usr/bin/env bash
# Arms the Actions scheduler: copies CRON_SECRET from a Vercel production env
# pull into the repository secret, and flips the master switch variable.
#
#   bash scripts/set-github-secrets.sh /path/to/prod.env
#
# The env file comes from `vercel env pull --environment=production <file>`.
# CRON_SECRET is deliberately NOT read from .env.local: it is not there, and
# the value that matters is the one production actually checks.
#
# Idempotent: gh secret set / variable set overwrite in place.
set -euo pipefail

ENV_FILE="${1:?usage: set-github-secrets.sh <prod.env from vercel env pull>}"
REPO="kenyonexpress/kenyonexpress"

CRON_SECRET_VALUE=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$CRON_SECRET_VALUE" ]; then
  echo "CRON_SECRET not found in $ENV_FILE" >&2
  exit 1
fi

printf '%s' "$CRON_SECRET_VALUE" | gh secret set CRON_SECRET --repo "$REPO"
gh variable set CRON_SCHEDULER_ENABLED --repo "$REPO" --body "true"
gh variable set CRON_NTFY_TOPIC --repo "$REPO" --body "kenyon-ofir-limit"
# Not set on purpose: the workflow falls back to cron-jobs.json defaultBaseUrl
# (kenyonexpress.vercel.app). Set CRON_BASE_URL only after the DNS cutover.
echo "armed: secret CRON_SECRET, variables CRON_SCHEDULER_ENABLED=true, CRON_NTFY_TOPIC"
