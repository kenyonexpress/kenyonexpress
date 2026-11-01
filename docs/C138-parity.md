# C138 — PARITY GATE (compare.mjs vs Electro v7, gate < 11%)

Date: 2026-11-02. Server: `next dev -p 3317` on this checkout (branch closeout/v1-final), live Supabase.
Seeding: not needed — catalogue already has active products; `/product/מוצר-לדוגמא` and `/category/hot-deals` both 200 (`/c/hot-deals` 307 -> /category/hot-deals).

Command per page/width:
`COMPARE_ALLOW_PENDING_IMAGES=1 LOCAL_BASE=http://localhost:3317 node scripts/compare.mjs --page=<home|product|category> --width=<w>`
Reference = default frozen Electro captures from scripts/parity-baseline.mjs (home `refs/electro_v7_{w}.png`, product `refs/electro_product_{w}.png`, category `refs/electro_shop_{w}.png`).

## Raw output
```
=== home 380
OVERALL first 2600px: 45.72%
  of which: reference blank 18.9%  ours blank 13.41%  both painted 13.41%
worst bands:
  y  200-300   100%
  y  300-400   98.2%
  y 1900-2000  80.8%
  y 2300-2400  78.8%
  y 1200-1300  74.4%
  y  700-800   69.2%
  y  600-700   67.7%
  y  100-200   62.4%
  y 2000-2100  62.4%
  y    0-100   60.3%
  y 1600-1700  54.3%
  y 1800-1900  54.1%
all bands:
  y    0   60.3%  ##############################
  y  100   62.4%  ###############################
  y  200    100%  ##################################################
  y  300   98.2%  #################################################
  y  400    7.9%  ####
  y  500   37.7%  ###################
  y  600   67.7%  ##################################
  y  700   69.2%  ###################################
  y  800   28.3%  ##############
=== home 768
OVERALL first 2600px: 40.32%
  of which: reference blank 16.8%  ours blank 14.34%  both painted 9.19%
worst bands:
  y 1900-2000  80.7%
  y 2000-2100  78.6%
  y 1500-1600  77.4%
  y 2400-2500  71.2%
  y 2500-2600  69.1%
  y 1400-1500  60.8%
  y    0-100   58.2%
  y 1600-1700  55.4%
  y  900-1000  45.5%
  y  200-300   43.7%
  y 2300-2400  42%
  y  800-900   40%
all bands:
  y    0   58.2%  #############################
  y  100   29.2%  ###############
  y  200   43.7%  ######################
  y  300     26%  #############
  y  400   30.4%  ###############
  y  500   12.2%  ######
  y  600   20.8%  ##########
  y  700   26.1%  #############
  y  800     40%  ####################
=== home 1440
OVERALL first 2600px: 27.53%
  of which: reference blank 12.01%  ours blank 8.36%  both painted 7.16%
worst bands:
  y 1700-1800  75.1%
  y 2100-2200  68.1%
  y 1600-1700  66.3%
  y 2200-2300  65.2%
  y  300-400   30.7%
  y  200-300   29.9%
  y  400-500   29.4%
  y 1500-1600  28.7%
  y 2000-2100  28.5%
  y 1100-1200  28.4%
  y 1300-1400  24.8%
  y 1800-1900  24%
all bands:
  y    0   13.5%  #######
  y  100   22.4%  ###########
  y  200   29.9%  ###############
  y  300   30.7%  ###############
  y  400   29.4%  ###############
  y  500   23.6%  ############
  y  600   11.3%  ######
  y  700   10.5%  #####
  y  800   13.6%  #######
=== product 380
OVERALL first 2600px: 41.63%
  of which: reference blank 29.64%  ours blank 7.3%  both painted 4.69%
!! Fix the server, then re-measure. Do not chase the bands.
worst bands:
  y  300-400   91.9%
  y  700-800   91.7%
  y  400-500   91.4%
  y  600-700   90%
  y  200-300   89.2%
  y  800-900   88%
  y  500-600   69.2%
  y    0-100   62.3%
  y 1300-1400  51%
  y 2100-2200  44.9%
  y 2500-2600  40.9%
  y 1200-1300  38.4%
all bands:
  y    0   62.3%  ###############################
  y  100   24.9%  ############
  y  200   89.2%  #############################################
  y  300   91.9%  ##############################################
  y  400   91.4%  ##############################################
  y  500   69.2%  ###################################
  y  600     90%  #############################################
  y  700   91.7%  ##############################################
=== product 768
OVERALL first 2600px: 31.01%
  of which: reference blank 18.63%  ours blank 6.84%  both painted 5.53%
!! Fix the server, then re-measure. Do not chase the bands.
worst bands:
  y 2100-2200  98.9%
  y  500-600   71.2%
  y  400-500   67.3%
  y  300-400   64.5%
  y  200-300   63.3%
  y    0-100   59.3%
  y 2200-2300  49.4%
  y  600-700   48.4%
  y 1700-1800  37.3%
  y 1300-1400  30.9%
  y 1800-1900  26.7%
  y 1400-1500  23.2%
all bands:
  y    0   59.3%  ##############################
  y  100   20.5%  ##########
  y  200   63.3%  ################################
  y  300   64.5%  ################################
  y  400   67.3%  ##################################
  y  500   71.2%  ####################################
  y  600   48.4%  ########################
  y  700   10.7%  #####
=== product 1440
OVERALL first 2600px: 19.08%
  of which: reference blank 11.06%  ours blank 5.64%  both painted 2.38%
!! Fix the server, then re-measure. Do not chase the bands.
worst bands:
  y  600-700   60.3%
  y  100-200   49.3%
  y  500-600   47.4%
  y  400-500   40.2%
  y  300-400   39.4%
  y 1600-1700  37.3%
  y 1200-1300  36.1%
  y 1500-1600  36.1%
  y 1300-1400  34.6%
  y  200-300   24.9%
  y  700-800   13.3%
  y    0-100   12.3%
all bands:
  y    0   12.3%  ######
  y  100   49.3%  #########################
  y  200   24.9%  ############
  y  300   39.4%  ####################
  y  400   40.2%  ####################
  y  500   47.4%  ########################
  y  600   60.3%  ##############################
  y  700   13.3%  #######
=== category 380
OVERALL first 2600px: 30.49%
  of which: reference blank 10.45%  ours blank 17.22%  both painted 2.82%
!! Fix the server, then re-measure. Do not chase the bands.
worst bands:
  y 1400-1500  98.9%
  y 1500-1600  66.3%
  y  900-1000  61.6%
  y    0-100   60%
  y 1000-1100  52.1%
  y 1800-1900  39.3%
  y 1200-1300  33.1%
  y  200-300   33%
  y  300-400   32.7%
  y 1100-1200  31.5%
  y  500-600   31.4%
  y 2300-2400  28.4%
all bands:
  y    0     60%  ##############################
  y  100   16.3%  ########
  y  200     33%  #################
  y  300   32.7%  ################
  y  400   18.7%  #########
  y  500   31.4%  ################
  y  600   13.1%  #######
  y  700   26.6%  #############
=== category 768
OVERALL first 2600px: 29.88%
  of which: reference blank 8.27%  ours blank 19.69%  both painted 1.93%
!! Fix the server, then re-measure. Do not chase the bands.
worst bands:
  y 1400-1500  92.7%
  y 1300-1400  69.6%
  y    0-100   57.9%
  y  300-400   45%
  y 1100-1200  42.4%
  y  800-900   40.9%
  y 1800-1900  40.4%
  y 2500-2600  40.1%
  y 2100-2200  39.1%
  y  400-500   36.6%
  y 1500-1600  35.5%
  y 2400-2500  33.9%
all bands:
  y    0   57.9%  #############################
  y  100    5.2%  ###
  y  200   19.1%  ##########
  y  300     45%  #######################
  y  400   36.6%  ##################
  y  500   23.7%  ############
  y  600      4%  ##
  y  700   13.1%  #######
=== category 1440
OVERALL first 2600px: 17.55%
  of which: reference blank 4.67%  ours blank 12.19%  both painted 0.68%
worst bands:
  y 1300-1400  65.6%
  y  100-200   49.1%
  y 2000-2100  36.3%
  y 1700-1800  32.6%
  y 1900-2000  27.6%
  y  400-500   24.7%
  y 1100-1200  22.4%
  y 1800-1900  21.6%
  y  900-1000  21%
  y 1200-1300  20.3%
  y  500-600   19.7%
  y 1400-1500  19.4%
all bands:
  y    0   12.3%  ######
  y  100   49.1%  #########################
  y  200    3.9%  ##
  y  300    7.1%  ####
  y  400   24.7%  ############
  y  500   19.7%  ##########
  y  600     11%  ######
  y  700    5.7%  ###
  y  800   10.9%  #####
  y  100   49.1%  #########################
```

## Summary
| page | 380 | 768 | 1440 | gate <11 |
|---|---|---|---|---|
| home | 45.72 | 40.32 | 27.53 | FAIL |
| product | 41.63 | 31.01 | 19.08 | FAIL |
| category | 30.49 | 29.88 (height ratio 0.59x) | 17.55 | FAIL |

## Why the gate cannot pass without locked files (proof, home 380)
Element boxes on / at 380 (Playwright, same server):
```
0-113    div (TopBar, src/components/layout/TopBar.tsx — LOCKED)
113-162  header (MainHeader/Header — LOCKED)
162-402  section (hero row: HeroMobile mounted with HeroSection — "only work BELOW the hero row", LOCKED_COMPONENTS.md)
402-898  section.home-deal-of-day
```
Bands 0-400 at 380 are entirely topbar + header + hero row: 60.3 + 62.4 + 100 + 98.2 = 320.9 over 26 bands = **12.34 percentage points** of OVERALL.
Even if every band below the hero row were a 0% diff, home 380 would be ≥ 12.34% > 11%. The gate is unreachable at home 380 without editing locked files. Since the gate requires all three pages at all three widths, C138 cannot be DONE.

Header band y0-100 is also 57–62% on product/category at 380/768 (same locked TopBar/MainHeader).

No code changes in this item; no forbidden files touched.

RESULT: BLOCKED locked-component (home 380 topbar+header+hero bands alone = 12.34pt > 11% gate)
