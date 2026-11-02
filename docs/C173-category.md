# C173 CATEGORY PAGE (2026-11-03)

RESULT: BLOCKED supabase-rest-down C173

## Item
"CATEGORY PAGE: same rules, src per refs/band-products-*.png." Same rules as
C172: layout from old-site band screenshots and colours #FDB813 + #283A97.

## Decisions (by locked rules, not acted on as code)
- Layout stays Electro v7. The old site is a content source only, so
  refs/band-products-900.png (a LIVE vs MINE product strip) is not a layout
  source.
- The colours #FDB813 and #283A97 are not used. Locked tokens win: #fed700,
  #fedd26, #E4002B and #0062bd. `grep -rniE "FDB813|283A97" src` returns nothing.
- Image "src": category and product images are DB rows (`category.image_url`,
  product images in `src/app/(store)/category/[slug]/page.tsx:399`), not code.
  The images differ from the strip because the catalogues differ, and no code
  change fixes that.

## Why blocked
The gate (compare.mjs category at 380/768/1440) needs a production build, and
`pnpm build` prerenders from production Supabase. PostgREST was down for the
whole item. The build failed twice; this is not a code fault.

```
$ pnpm build   # attempt 1, 05:03 +07
{"ts":"2026-11-02T22:04:01.785Z","level":"error","event":"catalogue.supplier_ids_failed","request_id":null,"error":{"code":"PGRST002","details":null,"hint":null,"message":"Could not query the database for the schema cache. Retrying."}}
⨯ Error: catalogue.supplier_ids_failed: Could not query the database for the schema cache. Retrying.
EXIT 1
$ curl management API health (05:04 +07)
[{"name":"db","healthy":true,"status":"ACTIVE_HEALTHY"},{"name":"rest","healthy":false,"status":"UNHEALTHY",...,"error":"Service health check failed"}]
$ health poll, first and last of 30 s polls
05:04:28 [{"name":"rest","healthy":false,"status":"UNHEALTHY","info":{"db_schema":"public,graphql_public"},"error":"Service health check failed"}]
05:15:51 [{"name":"rest","healthy":false,"status":"UNHEALTHY","info":{"db_schema":"public,graphql_public"},"error":"Service health check failed"}]
$ pnpm build   # attempt 2, 05:15 +07
{"ts":"2026-11-02T22:15:16.463Z","level":"error","event":"db.query_failed","request_id":null,"method":"GET","target":"products","status":503,"duration_ms":3392}
{"ts":"2026-11-02T22:15:30.204Z","level":"error","event":"db.query_failed","request_id":null,"method":"GET","target":"coupon_deals","status":503,"duration_ms":6487}
EXIT 1
```

Last measured category gate (docs/UI-PARITY-REPORT.md, 2026-11-02 13:47-13:50,
0b0065daa-dirty): 3.79% / 4.90% / 1.38% PASS at 380 / 768 / 1440. Nothing in
the category page has changed since, but that run predates HEAD and was on a
dirty tree, so it does not count as proof for this item.

No code changes; no forbidden files touched.

RESULT: BLOCKED supabase-rest-down C173
