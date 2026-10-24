# L3 Product page parity: C04 (2026-10-25)

Command (per width): `COMPARE_ALLOW_GRID_MISMATCH=1 LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=product --width=<w> --baseline=electro-product-fresh_<w>.png`
(first 2600px, prod build via `next start -p 3311`, local page `/product/מוצר-לדוגמא`).

| Width | Diff   | Gate (<11%) | Page height (Electro ref / ours) |
|-------|--------|-------------|----------------------------------|
| 380   | 42.77% | FAIL        | 3776 / 3093                      |
| 768   | 33.85% | FAIL        | 2725 / 2600+                     |
| 1440  | 22.89% | FAIL        | 3395 / 2600+                     |

## Why the numbers are not a layout verdict
- `scripts/parity-baselines.json` points product at `refs/electro_product_{w}.png`, which does not exist. The
  captures on disk are `refs/electro-product-fresh_{w}.png`, so `--baseline=` is passed explicitly.
- Without `COMPARE_ALLOW_GRID_MISMATCH=1` the gate refuses: the Electro capture has no product-card grid the gate can
  count (null) and our page shows 4 related cards. The flag scores that mismatch deliberately, so these figures
  include the content difference.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` returns HTTP 401 in every env file (`.env.local`, `.env.production`, `.env.vercel`,
  backups). The service-role key works (200). Anon-key reads fail, same cause as C03.
- Server log: `product_detail.supplier_load_failed` (`column suppliers.verification_status does not exist`, 42703),
  so the supplier block is missing from the page.
- Bands at 380 are high across the whole page (y 1200-2500), i.e. the content below the gallery/summary differs
  in structure and height, not in a single grid gap or font clamp.

## Changes
None. Narrowing would be tuning against a page that lacks its data, and no forbidden file was needed.

## Next
1. Replace the anon key in `.env.local` (C51 recovery) and re-run.
2. Apply the missing `suppliers.verification_status` column via migrations/pending/ + Supabase MCP.
3. Add `refs/electro_product_{w}.png` copies (or fix `parity-baselines.json`) so the bare command works.
4. Re-run at 380/768/1440 and narrow only the failing width.
