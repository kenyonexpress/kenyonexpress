# C12 — responsive parity (home, product, category, cart, checkout at 380/768/1440)

Result: BLOCKED — no valid reference to score against. No page was scored, so no gate passed.

## Measured 2026-10-27

`node scripts/compare.mjs --page=home --width=380` and `--page=cart --width=380` both exit via
`enforceReference()` with code 5: "live side is our-build". `kenyonexpress.co.il` is now this
project's own Vercel deployment, so the LIVE_* URLs compare our build with itself. Such a number
would be near zero and would read as a pass, so the gate correctly refuses (docs/PARITY-REFERENCE.md).

## Reference coverage in refs/

| page | Electro v7 reference |
|---|---|
| home | electro-home-v7.html + PNG at 380/768/1440 + computed JSON |
| product | electro-product-fresh.html + PNG at 380/768/1440 + computed JSON |
| category | none |
| cart | none (only measure-cart-checkout.json, text measurements) |
| checkout | none (only electro-checkout-text.json / ke-checkout-measured.json) |

Home and product could be scored against the Electro PNGs only with a new compare mode that takes
a static image as the left-hand side. Category, cart and checkout have no visual reference at all.
Scoring them against anything else would not be a fidelity measurement.

## What is needed to unblock

1. Capture Electro v7 category, cart and checkout pages at 380/768/1440 into refs/.
2. Add a `--live=<png>` mode to scripts/compare.mjs that skips enforceReference for static
   Electro captures (the identity guard is for the WooCommerce site and does not apply to them).

No forbidden files were touched. No source changes made.

## Update 2026-10-29 (re-check against latest measurements)

Valid scored runs against `file://refs/electro-*.html` (STATE.md M01-c267, M02-c266, G05), first 2600px:

| page | 380 | 768 | 1440 | gate <11% |
|---|---|---|---|---|
| home | 39.85% | 36.59% | 27.52% | FAIL (height ratio 2.10x / 1.71x at 380 / 768, so structure differs) |
| product | 23.40% | 21.93% | 16.50% | FAIL (indicative only, grid-count mismatch) |
| category (/c, /c/<slug>) | n/a | n/a | n/a | no Electro reference, compare refuses |
| cart | n/a | n/a | n/a | no Electro reference |
| checkout | n/a | n/a | n/a | no Electro reference |

3 of 5 pages cannot be scored at all, and the 2 that can are 5 to 29 points over the gate. Closing the
home gap would also need the header, top bar and hero inside the first 2600px, and those are locked files.

RESULT: BLOCKED gate-fail (home 39.85/36.59/27.52, product 23.40/21.93/16.50; category/cart/checkout have no reference)
