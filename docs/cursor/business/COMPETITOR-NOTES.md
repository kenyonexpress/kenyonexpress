# Competitor notes (Groo-like)

Groo/Groupon-class: marketplace coupons, app scan, heavy search facets, English, wallet payouts to merchants, escrow language in some IL sites, compare widgets, aggressive abandoned-cart coupons.

| They do | We do | Matter for v7? |
|---|---|---|
| % off face as the SKU | Absolute `coupon_price_ils` | **Yes.** Our whole money model. Do not copy %. |
| Merchant payout rail | Coupon 100% platform; cash at till | **Yes.** Copy would be a lie. |
| Faceted search product | Header + `/search`, Meili backend | No for v7 |
| Escrow hold until scan | Forbidden | **Yes** we must not imitate |
| YITH compare | Deferred W32-like skip | No |
| Multi-language | he only | No |
| SMS blasts | No Twilio required | No |
| Sub-merchant Cardcom | Platform merchant | **Yes** keep |

Matters: trust copy (no נאמנות), honest prepaid vs till, scan reliability. Does not matter: matching Groo's facet chrome before H6.

---

## Second pass

Do not copy % off face. Do not copy merchant payout rail. Do not copy escrow. Facets and EN are not v7.
