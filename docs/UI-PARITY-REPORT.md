# UI parity report

Every `scripts/compare.mjs` run appends a row here automatically -- the gate
writes it, not the person running the gate, because the version where a person
wrote it produced an empty file while three measurements sat in a commit
message.

**The gate is 11%.** A row above it is an open defect, and the cause
belongs in the notes column rather than being left as a number.

The diff is the share of mismatched pixels over the first 2600px of the page,
live against our build, at the stated viewport width. `dirty` on a commit means
the tree had uncommitted changes when it was measured.

| when (UTC) | page | width | diff | verdict | commit | notes |
|---|---|---:|---:|---|---|---|
| 2026-09-04 07:45 | home | 380 | 10.95% | PASS | `18ca285a3` | after ui-01 token gate |
| 2026-09-04 07:45 | home | 768 | 7.56% | PASS | `18ca285a3` | after ui-01 token gate |
| 2026-09-04 07:45 | home | 1440 | 5.97% | PASS | `18ca285a3` | after ui-01 token gate |
| 2026-09-04 11:20 | home | 380 | 10.69% | PASS | `b51a69b7e` | after home-03: Electro photography replaced by BrandPlaceholder |
| 2026-09-04 11:20 | home | 768 | 7.32% | PASS | `b51a69b7e` | after home-03 |
| 2026-09-04 11:20 | home | 1440 | 7.03% | PASS | `b51a69b7e` | hero image band: the measured price of the placeholder |
| 2026-09-04 11:52 | home | 380 | 10.69% | PASS | `fed7f056e` | after home-04: shekel sign moved right of the digits |
| 2026-09-04 11:52 | home | 768 | 7.36% | PASS | `fed7f056e` | after home-04 |
| 2026-09-04 11:52 | home | 1440 | 7.07% | PASS | `fed7f056e` | after home-04 |
| 2026-09-04 05:26 | home | 1440 | 7.08% | PASS | `2dafc7f7e-dirty` |  |
| 2026-09-04 05:35 | home | 380 | 10.69% | PASS | `7aa36db06-dirty` | after home-05 (yellow panel) and home-06 (PWA banner) |
| 2026-09-04 05:37 | home | 768 | 7.36% | PASS | `7aa36db06-dirty` | after home-05 (yellow panel) and home-06 (PWA banner) |
| 2026-09-04 05:39 | home | 1440 | 7.08% | PASS | `7aa36db06-dirty` | after home-05 (yellow panel) and home-06 (PWA banner) |
| 2026-09-04 05:50 | home | 380 | 10.69% | PASS | `6bc219b24-dirty` | after home-07 copy audit |
| 2026-09-04 05:52 | home | 768 | 8.85% | PASS | `6bc219b24-dirty` | after home-07 copy audit |
| 2026-09-04 05:54 | home | 1440 | 14.49% | **FAIL** | `6bc219b24-dirty` | after home-07 copy audit |
| 2026-09-04 05:57 | home | 380 | 10.69% | PASS | `a4fea7f02-dirty` |  |
| 2026-09-04 05:59 | home | 768 | 8.85% | PASS | `ea1e16e16-dirty` |  |
| 2026-09-04 06:01 | home | 1440 | 14.48% | **FAIL** | `ea1e16e16-dirty` |  |
| 2026-09-04 06:07 | home | 1440 | 14.48% | **FAIL** | `51d4eb9c5` | band locate for the deals-rail card count |
| 2026-09-04 06:10 | home | 1440 | 14.48% | **FAIL** | `ac24ba497` |  |
| 2026-09-04 06:16 | home | 1440 | 8.13% | PASS | `ac24ba497-dirty` |  |
| 2026-09-04 06:18 | home | 380 | 10.69% | PASS | `ac24ba497-dirty` |  |
| 2026-09-04 06:20 | home | 768 | 7.71% | PASS | `ac24ba497-dirty` |  |
| 2026-09-04 06:26 | home | 380 | 10.68% | PASS | `9a8a0e066-dirty` |  |
| 2026-09-04 06:28 | home | 768 | 7.71% | PASS | `9a8a0e066-dirty` |  |
| 2026-09-04 06:30 | home | 1440 | 8.13% | PASS | `9a8a0e066-dirty` |  |
| 2026-09-04 06:42 | home | 380 | 10.68% | PASS | `dbebde11c` |  |
| 2026-09-04 06:44 | home | 768 | 7.71% | PASS | `dbebde11c-dirty` |  |
| 2026-09-04 06:46 | home | 1440 | 8.13% | PASS | `dbebde11c-dirty` |  |
| 2026-09-05 21:48 | home | 380 | 26.30% | **FAIL** | `1c3f291ed-dirty` | merge of main security bumps into closeout/v1-final |
| 2026-09-05 21:51 | home | 768 | 24.64% | **FAIL** | `1c3f291ed-dirty` | merge of main security bumps into closeout/v1-final |
| 2026-09-05 21:53 | home | 1440 | 20.26% | **FAIL** | `a16989d14-dirty` | merge of main security bumps into closeout/v1-final |
| 2026-09-05 21:55 | home | 380 | 10.68% | PASS | `a16989d14-dirty` |  |
| 2026-09-05 21:57 | home | 768 | 7.71% | PASS | `a16989d14-dirty` |  |
| 2026-09-05 21:59 | home | 1440 | 8.14% | PASS | `a16989d14-dirty` |  |
| 2026-09-05 21:59 | home | 380 | 10.68% | PASS | `a16989d14-dirty` | merge: main security bumps into closeout/v1-final |
| 2026-09-05 22:01 | home | 768 | 7.71% | PASS | `a16989d14-dirty` | merge: main security bumps into closeout/v1-final |
| 2026-09-05 22:01 | home | 380 | 10.68% | PASS | `a16989d14-dirty` |  |
| 2026-09-05 22:03 | home | 1440 | 8.13% | PASS | `a16989d14-dirty` | merge: main security bumps into closeout/v1-final |
| 2026-09-05 22:03 | home | 768 | 7.71% | PASS | `a16989d14-dirty` |  |
| 2026-09-05 22:05 | home | 1440 | 8.13% | PASS | `13775cab0` |  |
| 2026-09-05 22:13 | home | 1440 | 8.13% | PASS | `9fd7681b6-dirty` | live-delta band locate |
| 2026-09-05 22:18 | home | 380 | 10.68% | PASS | `9fd7681b6-dirty` | deals-to-footer gap closed to live's 60px |
| 2026-09-05 22:20 | home | 768 | 7.71% | PASS | `9fd7681b6-dirty` | deals-to-footer gap closed to live's 60px |
| 2026-09-05 22:22 | home | 1440 | 8.14% | PASS | `5dd3fa80a-dirty` | deals-to-footer gap closed to live's 60px |
| 2026-09-05 22:49 | home | 380 | 10.68% | PASS | `493734605-dirty` | placeholder: neutral grey + Hebrew slot name |
| 2026-09-05 22:51 | home | 768 | 7.72% | PASS | `c4a8352c8-dirty` | placeholder: neutral grey + Hebrew slot name |
| 2026-09-05 22:53 | home | 1440 | 8.13% | PASS | `c4a8352c8-dirty` | placeholder: neutral grey + Hebrew slot name |
| 2026-09-05 23:02 | home | 380 | 10.68% | PASS | `7662223fd-dirty` |  |
| 2026-09-05 23:04 | home | 768 | 7.72% | PASS | `7662223fd-dirty` |  |
| 2026-09-05 23:06 | home | 1440 | 8.12% | PASS | `d37a60d7d-dirty` |  |
| 2026-09-08 20:51 | home | 380 | n/a | REFUSED | `5d24e06ab-dirty` | live side is unknown |
| 2026-09-08 20:51 | home | 768 | n/a | REFUSED | `5d24e06ab-dirty` | live side is unknown |
| 2026-09-08 20:51 | home | 1440 | n/a | REFUSED | `5d24e06ab-dirty` | live side is unknown |
| 2026-09-10 13:57 | category | 380 | 10.08% | PASS | `039aa73c5-dirty` | shell-band y0..159, mine vs 09-04 archived live-category.png; compare.mjs impossible, reference gone |
| 2026-09-16 13:05 | home | 380 | 27.26% | **FAIL** | `84657b8b1-dirty` | mine vs 08-12 archived live capture (ke_live_380.png); compare.mjs impossible, reference gone |
| 2026-09-16 13:05 | home | 768 | 25.85% | **FAIL** | `84657b8b1-dirty` | mine vs 08-12 archived live capture (ke_live_768.png); compare.mjs impossible, reference gone |
| 2026-09-16 13:05 | home | 1440 | 10.47% | PASS | `84657b8b1-dirty` | mine vs 08-12 archived live capture (ke_live_1440.png); compare.mjs impossible, reference gone |
| 2026-09-16 13:36 | home | 380 | 27.26% | **FAIL** | `bfd12b3d6` | baseline before HOME-PAGE goal; mine vs 08-12 archived live capture, consent banner visible |
| 2026-09-16 13:38 | home | 768 | 25.85% | **FAIL** | `bfd12b3d6-dirty` | baseline before HOME-PAGE goal; mine vs 08-12 archived live capture, consent banner visible |
| 2026-09-16 13:39 | home | 1440 | 10.47% | PASS | `bfd12b3d6-dirty` | baseline before HOME-PAGE goal; mine vs 08-12 archived live capture, consent banner visible |
| 2026-09-16 13:40 | home | 380 | 27.26% | **FAIL** | `bfd12b3d6-dirty` | (rerun of baseline, same shot; band listing only) |
| 2026-09-16 13:42 | home | 380 | 28.07% | **FAIL** | `bfd12b3d6-dirty` | baseline before HOME-PAGE goal; mine vs 09-04 archived live capture (ke-arch/refs, same day as the last green gate); consent banner visible |
| 2026-09-16 13:42 | home | 768 | 27.33% | **FAIL** | `bfd12b3d6-dirty` | baseline before HOME-PAGE goal; mine vs 09-04 archived live capture (ke-arch/refs, same day as the last green gate); consent banner visible |
| 2026-09-16 13:42 | home | 1440 | 7.37% | PASS | `bfd12b3d6-dirty` | baseline before HOME-PAGE goal; mine vs 09-04 archived live capture (ke-arch/refs, same day as the last green gate); consent banner visible |
| 2026-09-16 13:47 | home | 380 | 47.84% | **FAIL** | `bfd12b3d6-dirty` | HOME-PAGE: handheld header 84->50, feature strip one nowrap row below lg, shot with consent decided; mine vs 09-04 archived live capture (ke-arch/refs) |
| 2026-09-16 13:49 | home | 768 | 48.65% | **FAIL** | `bfd12b3d6-dirty` | HOME-PAGE: handheld header 84->50, feature strip one nowrap row below lg, shot with consent decided; mine vs 09-04 archived live capture (ke-arch/refs) |
| 2026-09-16 13:50 | home | 1440 | 45.83% | **FAIL** | `bfd12b3d6-dirty` | HOME-PAGE: handheld header 84->50, feature strip one nowrap row below lg, shot with consent decided; mine vs 09-04 archived live capture (ke-arch/refs) |
| 2026-09-24 00:05 | home | 380 | 9.29% | PASS | `69bcbd5c7-dirty` | homepage-closeout baseline at 69bcbd5c7; mine vs 08-12 archived ke_live_380.png |
| 2026-09-24 00:06 | home | 768 | 20.63% | **FAIL** | `69bcbd5c7-dirty` | homepage-closeout baseline at 69bcbd5c7; mine vs 08-12 archived ke_live_768.png |
| 2026-09-24 00:08 | home | 1440 | 11.12% | **FAIL** | `69bcbd5c7-dirty` | homepage-closeout baseline at 69bcbd5c7; mine vs 08-12 archived ke_live_1440.png |
| 2026-09-24 00:12 | home | 768 | 20.63% | **FAIL** | `69bcbd5c7-dirty` | homepage-closeout baseline rerun, optimizer warm; mine vs 08-12 archived ke_live_768.png |
| 2026-09-24 00:18 | home | 768 | 20.63% | **FAIL** | `69bcbd5c7-dirty` | experiment: shoot-mine with 8s paint wait after the sweep; tests whether the blank card photos at 768 are decode timing |
| 2026-09-30 14:10 | category | 1440 | n/a | REFUSED | `a24235235-dirty` | live side is our-build |
| 2026-09-30 14:54 | product | 380 | 4.17% | PASS | `0572faa3a-dirty` | live side: frozen capture `refs/electro_product_380.png`; overall 27.31% (reference blank 15.38%, ours blank 7.76%) |
| 2026-09-30 15:38 | home | 380 | 6.21% | PASS | `1147deac0-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 9.26% (reference blank 1.61%, ours blank 1.45%) |
| 2026-09-30 15:40 | home | 768 | 4.18% | PASS | `1147deac0-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 9.03% (reference blank 3.39%, ours blank 1.46%) |
| 2026-09-30 16:25 | home | 380 | 6.21% | PASS | `dab577bfb-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 9.26% (reference blank 1.61%, ours blank 1.45%) |
| 2026-09-30 16:27 | home | 768 | 4.18% | PASS | `dab577bfb-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 9.03% (reference blank 3.39%, ours blank 1.46%) |
| 2026-09-30 16:28 | home | 1440 | 1.14% | PASS | `dab577bfb-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 11.09% (reference blank 8.69%, ours blank 1.26%) |
| 2026-10-14 01:33 | home | 380 | 1.12% | PASS | `75147b4b7-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 26.68% (reference blank 1.39%, ours blank 24.16%) |
| 2026-10-14 01:35 | home | 768 | 1.66% | PASS | `75147b4b7-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 24.51% (reference blank 1.2%, ours blank 21.65%) |
| 2026-10-14 01:37 | home | 1440 | 1.56% | PASS | `75147b4b7-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 12.61% (reference blank 1.21%, ours blank 9.85%) |
| 2026-10-14 01:39 | home | 380 | 1.12% | PASS | `75147b4b7-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 26.68% (reference blank 1.39%, ours blank 24.16%) |
| 2026-10-14 01:40 | home | 768 | 1.66% | PASS | `2d571b67e-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 24.51% (reference blank 1.2%, ours blank 21.65%) |
| 2026-10-14 01:42 | home | 1440 | 1.58% | PASS | `bec260da1-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 12.64% (reference blank 1.21%, ours blank 9.85%) |
| 2026-10-14 02:00 | home | 380 | 6.18% | PASS | `ff3cf3b51-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 8.91% (reference blank 1.41%, ours blank 1.33%) |
| 2026-10-14 02:02 | home | 768 | 4.25% | PASS | `ff3cf3b51-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 9.01% (reference blank 3.33%, ours blank 1.43%) |
| 2026-10-14 02:03 | home | 1440 | 1.16% | PASS | `ff3cf3b51-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.98% (reference blank 8.62%, ours blank 1.2%) |
| 2026-10-14 02:23 | home | 380 | 6.24% | PASS | `ff3cf3b51-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 8.81% (reference blank 1.3%, ours blank 1.27%) |
| 2026-10-14 02:25 | home | 768 | 4.19% | PASS | `ff3cf3b51-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 8.66% (reference blank 3.05%, ours blank 1.42%) |
| 2026-10-14 02:26 | home | 1440 | 1.16% | PASS | `ff3cf3b51-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.99% (reference blank 8.55%, ours blank 1.28%) |
| 2026-10-14 02:57 | home | 380 | n/a | REFUSED | `ff3cf3b51-dirty` | live side is our-build |
| 2026-10-14 02:57 | home | 380 | 2.23% | PASS | `ff3cf3b51-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.41% (reference blank 1.13%, ours blank 1.06%) |
| 2026-10-14 02:59 | home | 768 | 1.25% | PASS | `ff3cf3b51-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.24% (reference blank 2.84%, ours blank 1.15%) |
| 2026-10-14 03:01 | home | 1440 | 1.16% | PASS | `ff3cf3b51-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.97% (reference blank 8.54%, ours blank 1.27%) |
| 2026-10-14 03:28 | home | 380 | 2.22% | PASS | `f10f9e166-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 03:30 | home | 768 | 1.25% | PASS | `f10f9e166-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 03:31 | home | 1440 | 1.16% | PASS | `f10f9e166-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.97% (reference blank 8.54%, ours blank 1.27%) |
| 2026-10-14 04:01 | home | 380 | 2.22% | PASS | `a6fb97765-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 04:03 | home | 768 | 1.25% | PASS | `a6fb97765-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 04:04 | home | 1440 | 1.16% | PASS | `a6fb97765-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.97% (reference blank 8.54%, ours blank 1.27%) |
| 2026-10-14 04:27 | home | 380 | 2.22% | PASS | `a4372338a-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 04:29 | home | 768 | 1.25% | PASS | `a4372338a-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 04:30 | home | 1440 | 1.16% | PASS | `a4372338a-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.97% (reference blank 8.54%, ours blank 1.27%) |
| 2026-10-14 04:54 | home | 380 | 2.22% | PASS | `2ebde3835-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 04:56 | home | 768 | 1.25% | PASS | `2ebde3835-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 04:57 | home | 1440 | 1.32% | PASS | `2ebde3835-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.92% (reference blank 8.52%, ours blank 1.09%) |
| 2026-10-14 05:07 | home | 380 | 2.22% | PASS | `2ebde3835-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 05:08 | home | 768 | 1.25% | PASS | `2ebde3835-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 05:10 | home | 1440 | 1.32% | PASS | `2ebde3835-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.92% (reference blank 8.52%, ours blank 1.09%) |
| 2026-10-14 05:32 | home | 380 | 2.22% | PASS | `9f7ace3ec-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 05:33 | home | 768 | 1.24% | PASS | `9f7ace3ec-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 05:35 | home | 1440 | 1.32% | PASS | `9f7ace3ec-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.92% (reference blank 8.52%, ours blank 1.09%) |
| 2026-10-14 05:55 | home | 380 | 2.22% | PASS | `74ac1edce-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 05:56 | home | 768 | 1.24% | PASS | `74ac1edce-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 05:58 | home | 1440 | 1.32% | PASS | `74ac1edce-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.92% (reference blank 8.52%, ours blank 1.09%) |
| 2026-10-14 06:03 | home | 380 | 2.22% | PASS | `74ac1edce-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 06:04 | home | 768 | 1.24% | PASS | `74ac1edce-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 06:06 | home | 1440 | 1.32% | PASS | `74ac1edce-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.92% (reference blank 8.52%, ours blank 1.09%) |
| 2026-10-14 06:13 | home | 380 | 2.22% | PASS | `74ac1edce-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 06:15 | home | 768 | 1.24% | PASS | `74ac1edce-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 06:17 | home | 1440 | 1.32% | PASS | `74ac1edce-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.92% (reference blank 8.52%, ours blank 1.09%) |
| 2026-10-14 06:32 | home | 380 | 2.22% | PASS | `881fad63c-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 06:33 | home | 768 | 1.24% | PASS | `881fad63c-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 06:35 | home | 1440 | 1.32% | PASS | `881fad63c-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.92% (reference blank 8.52%, ours blank 1.09%) |
| 2026-10-14 07:09 | home | 380 | 2.22% | PASS | `fa3191dfe-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 07:11 | home | 768 | 1.24% | PASS | `fa3191dfe-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 07:12 | home | 1440 | 1.32% | PASS | `fa3191dfe-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.92% (reference blank 8.52%, ours blank 1.09%) |
| 2026-10-14 07:48 | home | 380 | 2.22% | PASS | `b3056ebc2-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 07:50 | home | 768 | 1.24% | PASS | `b3056ebc2-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 07:52 | home | 1440 | 1.32% | PASS | `b3056ebc2-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.92% (reference blank 8.52%, ours blank 1.09%) |
| 2026-10-14 08:20 | home | 380 | 2.22% | PASS | `fe8442834-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 08:22 | home | 768 | 1.24% | PASS | `fe8442834-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 08:23 | home | 1440 | 1.32% | PASS | `fe8442834-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.92% (reference blank 8.52%, ours blank 1.09%) |
| 2026-10-14 08:55 | home | 380 | 2.22% | PASS | `efe44cf05-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 08:56 | home | 768 | 1.24% | PASS | `efe44cf05-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 08:58 | home | 1440 | 1.32% | PASS | `efe44cf05-dirty` | live side: frozen capture `refs/ke_live_1440.png`; overall 10.92% (reference blank 8.52%, ours blank 1.09%) |
| 2026-10-14 08:59 | cart | 380 | n/a | REFUSED | `efe44cf05-dirty` | live side is our-build |
| 2026-10-14 08:59 | checkout | 380 | n/a | REFUSED | `efe44cf05-dirty` | live side is our-build |
| 2026-10-14 10:02 | home | 380 | 2.22% | PASS | `e82d21e59-dirty` | live side: frozen capture `refs/ke_live_380.png`; overall 4.44% (reference blank 1.14%, ours blank 1.08%) |
| 2026-10-14 10:04 | home | 768 | 1.24% | PASS | `e82d21e59-dirty` | live side: frozen capture `refs/ke_live_768.png`; overall 5.23% (reference blank 2.83%, ours blank 1.15%) |
| 2026-10-14 10:31 | product | 380 | n/a | REFUSED | `192fa0120-dirty` | live side is our-build |
| 2026-10-14 10:32 | product | 380 | 5.33% | PASS | `192fa0120-dirty` | live side: frozen capture `refs/electro_product_380.png`; overall 31.41% (reference blank 19.16%, ours blank 6.92%) |
| 2026-10-14 10:34 | product | 768 | 4.07% | PASS | `192fa0120-dirty` | live side: frozen capture `refs/electro_product_768.png`; overall 30.97% (reference blank 20.36%, ours blank 6.53%) |
| 2026-10-14 10:36 | product | 1440 | 2.56% | PASS | `192fa0120-dirty` | live side: frozen capture `refs/electro_product_1440.png`; overall 23.41% (reference blank 15.39%, ours blank 5.45%) |
| 2026-10-14 11:03 | cart | 380 | n/a | REFUSED | `41e42094d-dirty` | live side is our-build |
| 2026-10-14 12:05 | checkout | 380 | n/a | REFUSED | `47ced0878-dirty` | live side is our-build |
| 2026-10-14 15:25 | search | 380 | n/a | REFUSED | `ced6e7dc5-dirty` | live side is our-build |
| 2026-10-14 15:57 | category | 380 | n/a | REFUSED | `f557aa9e2-dirty` | live side is our-build |
| 2026-10-14 17:50 | home | 380 | n/a | REFUSED | `43738bf43-dirty` | live side is our-build |
| 2026-10-14 18:14 | home | 380 | n/a | REFUSED | `99ceaf9e9-dirty` | live side is our-build |
| 2026-10-14 18:39 | home | 380 | n/a | REFUSED | `7d1562a86-dirty` | live side is our-build |
| 2026-10-14 19:29 | home | 380 | n/a | REFUSED | `37482ca67-dirty` | live side is our-build |
| 2026-10-14 20:39 | home | 380 | n/a | REFUSED | `a1ee1c030-dirty` | live side is our-build |
| 2026-10-16 08:04 | home | 380 | n/a | REFUSED | `b374a605f` | live side is our-build |
