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
| 2026-10-12 17:48 | home | 380 | n/a | REFUSED | `d40042ed5-dirty` | live side is our-build |
| 2026-10-12 17:52 | home | 380 | 10.35% | PASS | `e23a61480-dirty` | live side: frozen capture `refs/electro-home-v7_380.png`; overall 40.98% (reference blank 16.01%, ours blank 14.62%) |
| 2026-10-12 17:54 | home | 768 | 10.58% | PASS | `e23a61480-dirty` | live side: frozen capture `refs/electro-home-v7_768.png`; overall 39.44% (reference blank 17.33%, ours blank 11.52%) |
| 2026-10-12 17:55 | home | 1440 | 7.82% | PASS | `e23a61480-dirty` | live side: frozen capture `refs/electro-home-v7_1440.png`; overall 28.97% (reference blank 13.02%, ours blank 8.14%) |
| 2026-10-12 18:12 | home | 380 | 10.93% | PASS | `e23a61480-dirty` | live side: frozen capture `refs/electro_v7_380.png`; overall 41.49% (reference blank 15.93%, ours blank 14.63%) |
| 2026-10-12 18:13 | home | 768 | 10.61% | PASS | `e23a61480-dirty` | live side: frozen capture `refs/electro_v7_768.png`; overall 39.53% (reference blank 17.38%, ours blank 11.54%) |
| 2026-10-12 18:15 | home | 1440 | 7.81% | PASS | `e23a61480-dirty` | live side: frozen capture `refs/electro_v7_1440.png`; overall 28.93% (reference blank 13.04%, ours blank 8.08%) |
| 2026-10-12 18:20 | product | 380 | 5.22% | PASS | `6b1959924-dirty` | live side: frozen capture `refs/electro_product_380.png`; overall 33.61% (reference blank 20.98%, ours blank 7.41%) |
| 2026-10-12 18:22 | product | 768 | 4.23% | PASS | `6b1959924-dirty` | live side: frozen capture `refs/electro_product_768.png`; overall 27.69% (reference blank 16.47%, ours blank 6.99%) |
| 2026-10-12 18:24 | product | 1440 | 2.14% | PASS | `6b1959924-dirty` | live side: frozen capture `refs/electro_product_1440.png`; overall 17.29% (reference blank 9.3%, ours blank 5.85%) |
| 2026-10-12 18:31 | product | 380 | 5.53% | PASS | `6b1959924-dirty` | live side: frozen capture `refs/electro_product_380.png`; overall 33.45% (reference blank 20.42%, ours blank 7.5%) |
| 2026-10-12 18:33 | product | 768 | 3.98% | PASS | `6b1959924-dirty` | live side: frozen capture `refs/electro_product_768.png`; overall 27.48% (reference blank 16.63%, ours blank 6.87%) |
| 2026-10-12 18:36 | product | 1440 | 2.11% | PASS | `6b1959924-dirty` | live side: frozen capture `refs/electro_product_1440.png`; overall 17.29% (reference blank 9.33%, ours blank 5.86%) |
| 2026-10-14 01:13 | home | 380 | 10.93% | PASS | `01d1210a4-dirty` | live side: frozen capture `refs/electro_v7_380.png`; overall 41.49% (reference blank 15.93%, ours blank 14.63%) |
| 2026-10-14 01:15 | home | 768 | 10.61% | PASS | `01d1210a4-dirty` | live side: frozen capture `refs/electro_v7_768.png`; overall 39.53% (reference blank 17.38%, ours blank 11.54%) |
| 2026-10-14 01:17 | home | 1440 | 7.81% | PASS | `01d1210a4-dirty` | live side: frozen capture `refs/electro_v7_1440.png`; overall 28.93% (reference blank 13.04%, ours blank 8.08%) |
| 2026-10-14 01:38 | product | 380 | 4.30% | PASS | `e93162b16-dirty` | live side: frozen capture `refs/electro_product_380.png`; overall 27.42% (reference blank 15.24%, ours blank 7.88%) |
| 2026-10-14 01:40 | product | 768 | 4.18% | PASS | `e93162b16-dirty` | live side: frozen capture `refs/electro_product_768.png`; overall 27.58% (reference blank 16.79%, ours blank 6.61%) |
| 2026-10-14 01:42 | product | 1440 | 2.06% | PASS | `e93162b16-dirty` | live side: frozen capture `refs/electro_product_1440.png`; overall 17.43% (reference blank 9.49%, ours blank 5.88%) |
| 2026-10-14 01:44 | cart | 380 | n/a | REFUSED | `e93162b16-dirty` | live side is our-build |
| 2026-10-14 01:57 | product | 380 | 4.30% | PASS | `539895eef-dirty` | live side: frozen capture `refs/electro_product_380.png`; overall 27.42% (reference blank 15.24%, ours blank 7.88%) |
| 2026-10-14 01:59 | product | 768 | 4.18% | PASS | `539895eef-dirty` | live side: frozen capture `refs/electro_product_768.png`; overall 27.58% (reference blank 16.79%, ours blank 6.61%) |
| 2026-10-14 02:01 | product | 1440 | 2.06% | PASS | `539895eef-dirty` | live side: frozen capture `refs/electro_product_1440.png`; overall 17.43% (reference blank 9.49%, ours blank 5.88%) |
| 2026-10-14 02:03 | home | 380 | 10.93% | PASS | `539895eef-dirty` | live side: frozen capture `refs/electro_v7_380.png`; overall 41.49% (reference blank 15.93%, ours blank 14.63%) |
| 2026-10-14 02:05 | home | 768 | 10.61% | PASS | `539895eef-dirty` | live side: frozen capture `refs/electro_v7_768.png`; overall 39.53% (reference blank 17.38%, ours blank 11.54%) |
| 2026-10-14 02:06 | home | 1440 | 7.81% | PASS | `539895eef-dirty` | live side: frozen capture `refs/electro_v7_1440.png`; overall 28.93% (reference blank 13.04%, ours blank 8.08%) |
