# ARCHITECTURE-MEDIA-R2.md

ארכיטקטורת **מדיה / תמונות (R2 או S3-compatible)**.

Status: BINDING · `ke-arch` · Date: 2026-07-31 · docs only.

## Goals
- Store product/category/hero images off the app server.  
- Serve via CDN with Next image optimizer or public bucket URLs.  
- Import path from WP uploads during migration.

## Pipeline
```
Admin upload → signed URL → R2 object
  → media_assets row (product_id, path, width, height, alt_he)
  → invalidate cache tags
```

## Rules
1. No binary in git.  
2. Alt text Hebrew required before publish.  
3. Max size / MIME allowlist (jpeg/png/webp/avif).  
4. Public read; write via service role / signed PUT only.  
5. Delete orphan job after product unpublish (delayed).

## Perf
Provide width/height for CLS; responsive `sizes` on grids; single LCP hero priority.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Media/R2 binding in `ke-arch` (`arch/docs-queue`) |
