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
| 2026-10-24 15:40 | home | 1440 | n/a | REFUSED | `18ed044-dirty` | live side is our-build |
| 2026-10-24 18:41 | home | 380 | n/a | REFUSED | `7dfa488-dirty` | live side is our-build |
| 2026-10-24 18:41 | home | 768 | n/a | REFUSED | `7dfa488-dirty` | live side is our-build |
| 2026-10-24 18:41 | home | 1440 | n/a | REFUSED | `7dfa488-dirty` | live side is our-build |
| 2026-10-24 18:54 | category | 380 | n/a | REFUSED | `3c399a9-dirty` | live side is our-build |
| 2026-10-24 18:54 | category | 768 | n/a | REFUSED | `3c399a9-dirty` | live side is our-build |
| 2026-10-24 18:54 | category | 1440 | n/a | REFUSED | `3c399a9-dirty` | live side is our-build |
| 2026-10-24 20:02 | category | 380 | n/a | REFUSED | `93509402-dirty` | live side is our-build |
| 2026-10-24 20:02 | category | 768 | n/a | REFUSED | `93509402-dirty` | live side is our-build |
| 2026-10-24 20:02 | category | 1440 | n/a | REFUSED | `93509402-dirty` | live side is our-build |
| 2026-10-25 01:11 | home | 380 | n/a | REFUSED | `0697267c-dirty` | live side is our-build |
| 2026-10-25 01:11 | home | 768 | n/a | REFUSED | `0697267c-dirty` | live side is our-build |
| 2026-10-25 01:11 | home | 1440 | n/a | REFUSED | `0697267c-dirty` | live side is our-build |
| 2026-10-25 01:12 | product | 380 | n/a | REFUSED | `30b6e987-dirty` | live side is our-build |
| 2026-10-25 01:12 | product | 768 | n/a | REFUSED | `30b6e987-dirty` | live side is our-build |
| 2026-10-25 01:12 | product | 1440 | n/a | REFUSED | `30b6e987-dirty` | live side is our-build |
| 2026-10-25 01:12 | category | 380 | n/a | REFUSED | `30b6e987-dirty` | live side is our-build |
| 2026-10-25 01:12 | category | 768 | n/a | REFUSED | `30b6e987-dirty` | live side is our-build |
| 2026-10-25 01:12 | category | 1440 | n/a | REFUSED | `30b6e987-dirty` | live side is our-build |
| 2026-10-25 02:10 | category | 380 | n/a | REFUSED | `30b6e987-dirty` | live side is our-build |
| 2026-10-25 03:00 | product | 1440 | n/a | REFUSED | `30b6e987-dirty` | live side is our-build |
| 2026-10-25 03:00 | category | 380 | n/a | REFUSED | `b9114b7a-dirty` | live side is our-build |
| 2026-10-25 03:00 | category | 768 | n/a | REFUSED | `b9114b7a-dirty` | live side is our-build |
| 2026-10-25 03:00 | category | 1440 | n/a | REFUSED | `b9114b7a-dirty` | live side is our-build |
| 2026-10-25 04:15 | home | 380 | n/a | REFUSED | `8a28a3f6-dirty` | live side is our-build |
| 2026-10-25 04:15 | home | 768 | n/a | REFUSED | `8a28a3f6-dirty` | live side is our-build |
| 2026-10-25 04:15 | home | 1440 | n/a | REFUSED | `8a28a3f6-dirty` | live side is our-build |
| 2026-10-25 04:15 | product | 1440 | n/a | REFUSED | `7583aa62-dirty` | live side is our-build |
| 2026-10-25 04:16 | category | 380 | n/a | REFUSED | `7583aa62-dirty` | live side is our-build |
| 2026-10-25 04:16 | category | 768 | n/a | REFUSED | `7583aa62-dirty` | live side is our-build |
| 2026-10-25 04:16 | category | 1440 | n/a | REFUSED | `7583aa62-dirty` | live side is our-build |
| 2026-10-25 05:01 | home | 380 | n/a | REFUSED | `ea29931f-dirty` | live side is our-build |
| 2026-10-25 05:01 | home | 768 | n/a | REFUSED | `ea29931f-dirty` | live side is our-build |
| 2026-10-25 05:01 | home | 1440 | n/a | REFUSED | `ea29931f-dirty` | live side is our-build |
| 2026-10-25 05:02 | product | 380 | n/a | REFUSED | `ac23af3f-dirty` | live side is our-build |
| 2026-10-25 05:02 | product | 768 | n/a | REFUSED | `ac23af3f-dirty` | live side is our-build |
| 2026-10-25 05:02 | product | 1440 | n/a | REFUSED | `ac23af3f-dirty` | live side is our-build |
| 2026-10-25 05:02 | category | 380 | n/a | REFUSED | `9f5e6dfd-dirty` | live side is our-build |
| 2026-10-25 05:02 | category | 768 | n/a | REFUSED | `9f5e6dfd-dirty` | live side is our-build |
| 2026-10-25 05:02 | category | 1440 | n/a | REFUSED | `9f5e6dfd-dirty` | live side is our-build |
| 2026-10-25 06:10 | home | 380 | n/a | REFUSED | `462b3034-dirty` | live side is our-build |
| 2026-10-25 06:10 | home | 768 | n/a | REFUSED | `462b3034-dirty` | live side is our-build |
| 2026-10-25 06:10 | home | 1440 | n/a | REFUSED | `462b3034-dirty` | live side is our-build |
| 2026-10-25 06:26 | category | 380 | n/a | REFUSED | `aeae5561-dirty` | live side is our-build |
| 2026-10-25 06:26 | category | 768 | n/a | REFUSED | `aeae5561-dirty` | live side is our-build |
| 2026-10-25 06:26 | category | 1440 | n/a | REFUSED | `aeae5561-dirty` | live side is our-build |
| 2026-10-25 07:44 | home | 380 | n/a | REFUSED | `5962eb95-dirty` | live side is our-build |
| 2026-10-25 07:44 | home | 768 | n/a | REFUSED | `5962eb95-dirty` | live side is our-build |
| 2026-10-25 07:44 | home | 1440 | n/a | REFUSED | `5962eb95-dirty` | live side is our-build |
| 2026-10-25 07:45 | product | 1440 | n/a | REFUSED | `e98dbf11-dirty` | live side is our-build |
| 2026-10-25 08:50 | home | 380 | n/a | REFUSED | `e98dbf11-dirty` | live side is our-build |
| 2026-10-25 08:50 | home | 768 | n/a | REFUSED | `e98dbf11-dirty` | live side is our-build |
| 2026-10-25 08:50 | home | 1440 | n/a | REFUSED | `e98dbf11-dirty` | live side is our-build |
| 2026-10-25 08:51 | product | 1440 | n/a | REFUSED | `89cbf81e-dirty` | live side is our-build |
| 2026-10-25 09:52 | home | 380 | n/a | REFUSED | `89cbf81e-dirty` | live side is our-build |
| 2026-10-25 09:52 | home | 768 | n/a | REFUSED | `89cbf81e-dirty` | live side is our-build |
| 2026-10-25 09:52 | home | 1440 | n/a | REFUSED | `89cbf81e-dirty` | live side is our-build |
| 2026-10-25 09:53 | product | 380 | n/a | REFUSED | `938f789a-dirty` | live side is our-build |
| 2026-10-25 09:53 | product | 768 | n/a | REFUSED | `938f789a-dirty` | live side is our-build |
| 2026-10-25 09:53 | product | 1440 | n/a | REFUSED | `938f789a-dirty` | live side is our-build |
| 2026-10-25 10:02 | category | 380 | n/a | REFUSED | `ae1acbbe-dirty` | live side is our-build |
| 2026-10-25 10:02 | category | 768 | n/a | REFUSED | `ae1acbbe-dirty` | live side is our-build |
| 2026-10-25 10:02 | category | 1440 | n/a | REFUSED | `ae1acbbe-dirty` | live side is our-build |
| 2026-10-25 11:44 | category | 380 | n/a | REFUSED | `8866fb7b-dirty` | live side is our-build |
| 2026-10-25 11:44 | category | 768 | n/a | REFUSED | `8866fb7b-dirty` | live side is our-build |
| 2026-10-25 11:44 | category | 1440 | n/a | REFUSED | `8866fb7b-dirty` | live side is our-build |
| 2026-10-25 12:48 | home | 380 | n/a | REFUSED | `309a13a3-dirty` | live side is our-build |
| 2026-10-25 12:48 | home | 768 | n/a | REFUSED | `309a13a3-dirty` | live side is our-build |
| 2026-10-25 12:48 | home | 1440 | n/a | REFUSED | `309a13a3-dirty` | live side is our-build |
| 2026-10-25 12:49 | product | 380 | n/a | REFUSED | `f784706c-dirty` | live side is our-build |
| 2026-10-25 12:49 | product | 768 | n/a | REFUSED | `f784706c-dirty` | live side is our-build |
| 2026-10-25 12:49 | product | 1440 | n/a | REFUSED | `f784706c-dirty` | live side is our-build |
| 2026-10-25 12:49 | category | 380 | n/a | REFUSED | `33641b5c-dirty` | live side is our-build |
| 2026-10-25 12:49 | category | 768 | n/a | REFUSED | `33641b5c-dirty` | live side is our-build |
| 2026-10-25 12:49 | category | 1440 | n/a | REFUSED | `33641b5c-dirty` | live side is our-build |
| 2026-10-25 13:24 | home | 380 | n/a | REFUSED | `d47fed9a-dirty` | live side is our-build |
| 2026-10-25 13:24 | home | 768 | n/a | REFUSED | `d47fed9a-dirty` | live side is our-build |
| 2026-10-25 13:24 | home | 1440 | n/a | REFUSED | `d47fed9a-dirty` | live side is our-build |
| 2026-10-25 13:25 | category | 380 | n/a | REFUSED | `d47fed9a-dirty` | live side is our-build |
| 2026-10-25 13:25 | category | 768 | n/a | REFUSED | `d47fed9a-dirty` | live side is our-build |
| 2026-10-25 13:25 | category | 1440 | n/a | REFUSED | `d47fed9a-dirty` | live side is our-build |
| 2026-10-25 14:30 | product | 380 | n/a | REFUSED | `7182aff7-dirty` | live side is unknown |
| 2026-10-25 14:30 | product | 768 | n/a | REFUSED | `7182aff7-dirty` | live side is unknown |
| 2026-10-25 14:30 | product | 1440 | n/a | REFUSED | `7182aff7-dirty` | live side is unknown |
| 2026-10-25 14:30 | category | 380 | n/a | REFUSED | `7182aff7-dirty` | live side is our-build |
| 2026-10-25 14:30 | category | 768 | n/a | REFUSED | `7182aff7-dirty` | live side is unknown |
| 2026-10-25 14:30 | category | 1440 | n/a | REFUSED | `7182aff7-dirty` | live side is unknown |
| 2026-10-25 15:06 | home | 380 | n/a | REFUSED | `41c95db5-dirty` | live side is our-build |
| 2026-10-25 15:06 | home | 768 | n/a | REFUSED | `41c95db5-dirty` | live side is our-build |
| 2026-10-25 15:06 | home | 1440 | n/a | REFUSED | `41c95db5-dirty` | live side is our-build |
| 2026-10-25 15:08 | category | 380 | n/a | REFUSED | `967af3b4-dirty` | live side is our-build |
| 2026-10-25 15:08 | category | 768 | n/a | REFUSED | `967af3b4-dirty` | live side is our-build |
| 2026-10-25 15:08 | category | 1440 | n/a | REFUSED | `967af3b4-dirty` | live side is our-build |
| 2026-10-25 16:30 | home | 768 | n/a | REFUSED | `aecad4f7-dirty` | live side is our-build |
| 2026-10-25 16:30 | home | 1440 | n/a | REFUSED | `aecad4f7-dirty` | live side is our-build |
| 2026-10-25 16:31 | product | 380 | n/a | REFUSED | `aecad4f7-dirty` | live side is our-build |
| 2026-10-25 16:31 | product | 768 | n/a | REFUSED | `aecad4f7-dirty` | live side is our-build |
| 2026-10-25 16:31 | product | 1440 | n/a | REFUSED | `aecad4f7-dirty` | live side is our-build |
| 2026-10-25 16:33 | product | 380 | 36.58% | **FAIL** | `aecad4f7-dirty` |  |
| 2026-10-25 16:36 | product | 768 | 29.82% | **FAIL** | `aecad4f7-dirty` |  |
| 2026-10-25 16:41 | product | 1440 | 20.52% | **FAIL** | `aecad4f7-dirty` |  |
| 2026-10-25 16:44 | product | 380 | 36.58% | **FAIL** | `aecad4f7-dirty` |  |
| 2026-10-25 16:46 | product | 768 | 29.82% | **FAIL** | `aecad4f7-dirty` |  |
| 2026-10-25 16:49 | product | 1440 | 20.52% | **FAIL** | `aecad4f7-dirty` |  |
| 2026-10-25 16:52 | category | 380 | n/a | REFUSED | `aecad4f7-dirty` | live side is our-build |
| 2026-10-25 16:52 | category | 768 | n/a | REFUSED | `aecad4f7-dirty` | live side is our-build |
| 2026-10-25 16:52 | category | 1440 | n/a | REFUSED | `aecad4f7-dirty` | live side is our-build |
| 2026-10-25 18:02 | home | 380 | n/a | REFUSED | `aecad4f7-dirty` | live side is our-build |
| 2026-10-25 18:03 | home | 768 | n/a | REFUSED | `aecad4f7-dirty` | live side is our-build |
| 2026-10-25 18:04 | home | 1440 | n/a | REFUSED | `aecad4f7-dirty` | live side is our-build |
| 2026-10-25 18:05 | product | 380 | n/a | REFUSED | `1f9aacf2-dirty` | live side is our-build |
| 2026-10-25 18:06 | product | 768 | n/a | REFUSED | `1f9aacf2-dirty` | live side is our-build |
| 2026-10-25 18:06 | product | 1440 | n/a | REFUSED | `1f9aacf2-dirty` | live side is our-build |
| 2026-10-25 18:08 | category | 380 | n/a | REFUSED | `1f9aacf2-dirty` | live side is our-build |
| 2026-10-25 18:09 | category | 768 | n/a | REFUSED | `1f9aacf2-dirty` | live side is our-build |
| 2026-10-25 18:10 | category | 1440 | n/a | REFUSED | `1f9aacf2-dirty` | live side is our-build |
| 2026-10-25 18:37 | home | 380 | n/a | REFUSED | `997e8d54-dirty` | live side is our-build |
| 2026-10-25 18:37 | home | 768 | n/a | REFUSED | `997e8d54-dirty` | live side is our-build |
| 2026-10-25 18:37 | home | 1440 | n/a | REFUSED | `997e8d54-dirty` | live side is our-build |
| 2026-10-25 18:38 | product | 380 | n/a | REFUSED | `64c1f280-dirty` | live side is our-build |
| 2026-10-25 18:38 | product | 768 | n/a | REFUSED | `64c1f280-dirty` | live side is our-build |
| 2026-10-25 18:38 | product | 1440 | n/a | REFUSED | `64c1f280-dirty` | live side is our-build |
| 2026-10-25 18:39 | category | 1440 | n/a | REFUSED | `64c1f280-dirty` | live side is our-build |
| 2026-10-25 18:53 | home | 380 | n/a | REFUSED | `5b2e0b95-dirty` | live side is our-build |
| 2026-10-25 18:53 | home | 768 | n/a | REFUSED | `5b2e0b95-dirty` | live side is our-build |
| 2026-10-25 18:53 | home | 1440 | n/a | REFUSED | `5b2e0b95-dirty` | live side is our-build |
| 2026-10-25 18:54 | product | 1440 | n/a | REFUSED | `929a072f-dirty` | live side is our-build |
| 2026-10-25 19:25 | home | 380 | n/a | REFUSED | `57b3d72d-dirty` | live side is our-build |
| 2026-10-25 19:25 | home | 768 | n/a | REFUSED | `57b3d72d-dirty` | live side is our-build |
| 2026-10-25 19:25 | home | 1440 | n/a | REFUSED | `57b3d72d-dirty` | live side is our-build |
| 2026-10-25 19:25 | product | 380 | n/a | REFUSED | `796a70f3-dirty` | live side is our-build |
| 2026-10-25 19:25 | product | 768 | n/a | REFUSED | `796a70f3-dirty` | live side is our-build |
| 2026-10-25 19:25 | product | 1440 | n/a | REFUSED | `796a70f3-dirty` | live side is our-build |
| 2026-10-25 19:28 | product | 380 | 43.58% | **FAIL** | `796a70f3-dirty` |  |
| 2026-10-25 19:30 | product | 768 | 33.72% | **FAIL** | `796a70f3-dirty` |  |
| 2026-10-25 19:32 | product | 1440 | 22.49% | **FAIL** | `796a70f3-dirty` |  |
| 2026-10-25 19:35 | product | 380 | 43.20% | **FAIL** | `796a70f3-dirty` |  |
| 2026-10-25 19:38 | product | 768 | 33.72% | **FAIL** | `796a70f3-dirty` |  |
| 2026-10-25 19:41 | product | 1440 | 22.49% | **FAIL** | `796a70f3-dirty` |  |
| 2026-10-25 19:43 | product | 380 | 43.59% | **FAIL** | `796a70f3-dirty` |  |
| 2026-10-25 19:45 | product | 768 | 33.72% | **FAIL** | `796a70f3-dirty` |  |
| 2026-10-25 19:48 | product | 1440 | 22.49% | **FAIL** | `796a70f3-dirty` |  |
| 2026-10-25 19:50 | category | 380 | n/a | REFUSED | `796a70f3-dirty` | live side is our-build |
| 2026-10-25 19:50 | category | 768 | n/a | REFUSED | `796a70f3-dirty` | live side is our-build |
| 2026-10-25 19:50 | category | 1440 | n/a | REFUSED | `796a70f3-dirty` | live side is our-build |
| 2026-10-25 20:17 | home | 380 | n/a | REFUSED | `5f8ad8f3-dirty` | live side is our-build |
| 2026-10-25 20:17 | home | 768 | n/a | REFUSED | `5f8ad8f3-dirty` | live side is our-build |
| 2026-10-25 20:18 | home | 1440 | n/a | REFUSED | `5f8ad8f3-dirty` | live side is our-build |
| 2026-10-25 20:18 | product | 380 | n/a | REFUSED | `5f8ad8f3-dirty` | live side is our-build |
| 2026-10-25 20:18 | product | 768 | n/a | REFUSED | `5f8ad8f3-dirty` | live side is our-build |
| 2026-10-25 20:18 | product | 1440 | n/a | REFUSED | `5f8ad8f3-dirty` | live side is our-build |
| 2026-10-25 20:19 | category | 380 | n/a | REFUSED | `5f8ad8f3-dirty` | live side is our-build |
| 2026-10-25 20:19 | category | 768 | n/a | REFUSED | `5f8ad8f3-dirty` | live side is our-build |
| 2026-10-25 20:19 | category | 1440 | n/a | REFUSED | `5f8ad8f3-dirty` | live side is our-build |
| 2026-10-25 21:08 | product | 380 | n/a | REFUSED | `7f3d9c7f-dirty` | live side is our-build |
| 2026-10-25 21:08 | product | 768 | n/a | REFUSED | `7f3d9c7f-dirty` | live side is our-build |
| 2026-10-25 21:08 | product | 1440 | n/a | REFUSED | `7f3d9c7f-dirty` | live side is our-build |
| 2026-10-25 21:09 | product | 380 | 43.59% | **FAIL** | `7f3d9c7f-dirty` |  |
| 2026-10-25 21:11 | product | 768 | 33.72% | **FAIL** | `7f3d9c7f-dirty` |  |
| 2026-10-25 21:14 | product | 1440 | 22.49% | **FAIL** | `7f3d9c7f-dirty` |  |
| 2026-10-25 21:16 | category | 380 | n/a | REFUSED | `7f3d9c7f-dirty` | live side is our-build |
| 2026-10-25 21:16 | category | 768 | n/a | REFUSED | `7f3d9c7f-dirty` | live side is our-build |
| 2026-10-25 21:16 | category | 1440 | n/a | REFUSED | `7f3d9c7f-dirty` | live side is our-build |
| 2026-10-25 21:45 | product | 380 | n/a | REFUSED | `a4cf51ba-dirty` | live side is our-build |
| 2026-10-25 21:45 | product | 768 | n/a | REFUSED | `a4cf51ba-dirty` | live side is our-build |
| 2026-10-25 21:45 | product | 1440 | n/a | REFUSED | `a4cf51ba-dirty` | live side is our-build |
| 2026-10-25 21:48 | product | 380 | 43.20% | **FAIL** | `a4cf51ba-dirty` |  |
| 2026-10-25 21:50 | product | 768 | 33.72% | **FAIL** | `a4cf51ba-dirty` |  |
| 2026-10-25 21:53 | product | 1440 | 22.49% | **FAIL** | `a4cf51ba-dirty` |  |
| 2026-10-25 21:56 | product | 380 | 43.58% | **FAIL** | `a4cf51ba-dirty` |  |
| 2026-10-25 21:58 | product | 768 | 33.72% | **FAIL** | `a4cf51ba-dirty` |  |
| 2026-10-25 22:00 | product | 1440 | 22.49% | **FAIL** | `a4cf51ba-dirty` |  |
| 2026-10-25 22:40 | category | 380 | n/a | REFUSED | `bb619771-dirty` | live side is our-build |
| 2026-10-25 22:40 | category | 768 | n/a | REFUSED | `bb619771-dirty` | live side is our-build |
| 2026-10-25 22:40 | category | 1440 | n/a | REFUSED | `bb619771-dirty` | live side is our-build |
| 2026-10-25 23:17 | home | 380 | n/a | REFUSED | `f8bc93c3-dirty` | live side is our-build |
| 2026-10-25 23:17 | home | 768 | n/a | REFUSED | `f8bc93c3-dirty` | live side is our-build |
| 2026-10-25 23:17 | home | 1440 | n/a | REFUSED | `f8bc93c3-dirty` | live side is our-build |
| 2026-10-25 23:19 | product | 380 | n/a | REFUSED | `e5201d92-dirty` | live side is our-build |
| 2026-10-25 23:19 | product | 768 | n/a | REFUSED | `e5201d92-dirty` | live side is our-build |
| 2026-10-25 23:20 | product | 1440 | n/a | REFUSED | `e5201d92-dirty` | live side is our-build |
| 2026-10-25 23:22 | product | 380 | 36.58% | **FAIL** | `e5201d92-dirty` |  |
| 2026-10-25 23:25 | product | 768 | 29.82% | **FAIL** | `e5201d92-dirty` |  |
| 2026-10-25 23:27 | product | 1440 | 20.41% | **FAIL** | `e5201d92-dirty` |  |
| 2026-10-26 00:37 | product | 380 | 36.17% | **FAIL** | `14111e62-dirty` |  |
| 2026-10-26 00:40 | product | 768 | 29.82% | **FAIL** | `14111e62-dirty` |  |
| 2026-10-26 00:42 | product | 1440 | 20.52% | **FAIL** | `14111e62-dirty` |  |
| 2026-10-26 00:44 | category | 380 | n/a | REFUSED | `6144f268-dirty` | live side is unknown |
| 2026-10-26 00:44 | category | 768 | n/a | REFUSED | `6144f268-dirty` | live side is unknown |
| 2026-10-26 00:44 | category | 1440 | n/a | REFUSED | `6144f268-dirty` | live side is unknown |
| 2026-10-26 01:25 | product | 380 | n/a | REFUSED | `f4386c40-dirty` | live side is our-build |
| 2026-10-26 01:25 | product | 768 | n/a | REFUSED | `f4386c40-dirty` | live side is our-build |
| 2026-10-26 01:25 | product | 1440 | n/a | REFUSED | `f4386c40-dirty` | live side is our-build |
| 2026-10-26 01:26 | category | 380 | n/a | REFUSED | `f4386c40-dirty` | live side is our-build |
| 2026-10-26 01:26 | category | 768 | n/a | REFUSED | `f4386c40-dirty` | live side is our-build |
| 2026-10-26 01:26 | category | 1440 | n/a | REFUSED | `f4386c40-dirty` | live side is our-build |
| 2026-10-26 02:18 | product | 380 | n/a | REFUSED | `dc11afad-dirty` | live side is unknown |
| 2026-10-26 02:18 | product | 768 | n/a | REFUSED | `dc11afad-dirty` | live side is unknown |
| 2026-10-26 02:18 | product | 1440 | n/a | REFUSED | `dc11afad-dirty` | live side is unknown |
| 2026-10-26 02:20 | product | 380 | 36.17% | **FAIL** | `dc11afad-dirty` |  |
| 2026-10-26 02:22 | product | 768 | 33.30% | **FAIL** | `dc11afad-dirty` |  |
| 2026-10-26 02:27 | category | 380 | n/a | REFUSED | `dc11afad-dirty` | live side is our-build |
| 2026-10-26 02:27 | category | 768 | n/a | REFUSED | `dc11afad-dirty` | live side is our-build |
| 2026-10-26 02:27 | category | 1440 | n/a | REFUSED | `dc11afad-dirty` | live side is our-build |
| 2026-10-26 03:22 | category | 380 | n/a | REFUSED | `a72b0ea1-dirty` | live side is our-build |
| 2026-10-26 03:22 | category | 768 | n/a | REFUSED | `a72b0ea1-dirty` | live side is our-build |
| 2026-10-26 03:22 | category | 1440 | n/a | REFUSED | `a72b0ea1-dirty` | live side is our-build |
| 2026-10-26 03:57 | home | 380 | n/a | REFUSED | `a72b0ea1-dirty` | live side is our-build |
| 2026-10-26 03:57 | home | 768 | n/a | REFUSED | `a72b0ea1-dirty` | live side is our-build |
| 2026-10-26 03:57 | home | 1440 | n/a | REFUSED | `a72b0ea1-dirty` | live side is our-build |
| 2026-10-26 04:02 | category | 380 | n/a | REFUSED | `7b3b8afe-dirty` | live side is our-build |
| 2026-10-26 04:03 | category | 768 | n/a | REFUSED | `7b3b8afe-dirty` | live side is our-build |
| 2026-10-26 04:03 | category | 1440 | n/a | REFUSED | `7b3b8afe-dirty` | live side is our-build |
| 2026-10-26 04:54 | home | 380 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 04:54 | home | 768 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 04:54 | home | 1440 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 04:57 | product | 380 | n/a | REFUSED | `ebcaef6a-dirty` | live side is unknown |
| 2026-10-26 04:57 | product | 768 | n/a | REFUSED | `ebcaef6a-dirty` | live side is unknown |
| 2026-10-26 04:57 | product | 1440 | n/a | REFUSED | `ebcaef6a-dirty` | live side is unknown |
| 2026-10-26 05:00 | product | 380 | 36.17% | **FAIL** | `ebcaef6a-dirty` |  |
| 2026-10-26 05:02 | product | 768 | 29.82% | **FAIL** | `ebcaef6a-dirty` |  |
| 2026-10-26 05:05 | product | 1440 | 20.52% | **FAIL** | `ebcaef6a-dirty` |  |
| 2026-10-26 05:07 | category | 380 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 05:07 | category | 768 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 05:07 | category | 1440 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 05:58 | home | 380 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 05:58 | home | 768 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 05:58 | home | 1440 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 06:07 | category | 380 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 06:07 | category | 768 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 06:08 | category | 1440 | n/a | REFUSED | `ebcaef6a-dirty` | live side is our-build |
| 2026-10-26 06:38 | product | 380 | n/a | REFUSED | `194b3560-dirty` | live side is our-build |
| 2026-10-26 06:38 | product | 768 | n/a | REFUSED | `194b3560-dirty` | live side is our-build |
| 2026-10-26 06:38 | product | 1440 | n/a | REFUSED | `194b3560-dirty` | live side is our-build |
| 2026-10-26 06:39 | category | 380 | n/a | REFUSED | `194b3560-dirty` | live side is our-build |
| 2026-10-26 06:39 | category | 768 | n/a | REFUSED | `194b3560-dirty` | live side is our-build |
| 2026-10-26 06:39 | category | 1440 | n/a | REFUSED | `194b3560-dirty` | live side is our-build |
| 2026-10-26 07:40 | product | 380 | n/a | REFUSED | `862b7c13-dirty` | live side is our-build |
| 2026-10-26 07:40 | product | 768 | n/a | REFUSED | `862b7c13-dirty` | live side is our-build |
| 2026-10-26 07:40 | product | 1440 | n/a | REFUSED | `862b7c13-dirty` | live side is our-build |
| 2026-10-26 07:41 | product | 380 | 36.58% | **FAIL** | `862b7c13-dirty` |  |
| 2026-10-26 07:44 | product | 768 | 29.82% | **FAIL** | `862b7c13-dirty` |  |
| 2026-10-26 07:46 | product | 1440 | 20.52% | **FAIL** | `862b7c13-dirty` |  |
| 2026-10-26 07:49 | product | 380 | 36.58% | **FAIL** | `862b7c13-dirty` |  |
| 2026-10-26 07:51 | product | 768 | 29.82% | **FAIL** | `862b7c13-dirty` |  |
| 2026-10-26 07:53 | product | 1440 | 20.52% | **FAIL** | `862b7c13-dirty` |  |
| 2026-10-26 07:55 | category | 380 | n/a | REFUSED | `862b7c13-dirty` | live side is our-build |
| 2026-10-26 07:55 | category | 768 | n/a | REFUSED | `862b7c13-dirty` | live side is our-build |
| 2026-10-26 07:55 | category | 1440 | n/a | REFUSED | `862b7c13-dirty` | live side is our-build |
| 2026-10-26 08:28 | product | 380 | 36.58% | **FAIL** | `a8385d22-dirty` |  |
| 2026-10-26 08:31 | product | 768 | 33.30% | **FAIL** | `a8385d22-dirty` |  |
| 2026-10-26 08:32 | product | 380 | n/a | REFUSED | `a8385d22-dirty` | live side is our-build |
| 2026-10-26 08:32 | product | 768 | n/a | REFUSED | `a8385d22-dirty` | live side is our-build |
| 2026-10-26 08:32 | product | 1440 | n/a | REFUSED | `a8385d22-dirty` | live side is our-build |
| 2026-10-26 08:34 | product | 1440 | 21.87% | **FAIL** | `a8385d22-dirty` |  |
| 2026-10-26 08:36 | product | 380 | 43.83% | **FAIL** | `a8385d22-dirty` |  |
| 2026-10-26 08:38 | product | 768 | 33.30% | **FAIL** | `a8385d22-dirty` |  |
| 2026-10-26 08:42 | product | 1440 | 22.34% | **FAIL** | `a8385d22-dirty` |  |
| 2026-10-26 08:45 | product | 380 | 43.83% | **FAIL** | `a8385d22-dirty` |  |
| 2026-10-26 08:47 | product | 768 | 35.27% | **FAIL** | `a8385d22-dirty` |  |
| 2026-10-26 08:52 | product | 1440 | 25.16% | **FAIL** | `a8385d22-dirty` |  |
| 2026-10-26 08:54 | category | 380 | n/a | REFUSED | `a8385d22-dirty` | live side is our-build |
| 2026-10-26 08:54 | category | 768 | n/a | REFUSED | `a8385d22-dirty` | live side is our-build |
| 2026-10-26 08:54 | category | 1440 | n/a | REFUSED | `a8385d22-dirty` | live side is our-build |
| 2026-10-26 09:48 | product | 380 | n/a | REFUSED | `bbc651f3-dirty` | live side is our-build |
| 2026-10-26 09:48 | product | 768 | n/a | REFUSED | `bbc651f3-dirty` | live side is our-build |
| 2026-10-26 09:48 | product | 1440 | n/a | REFUSED | `bbc651f3-dirty` | live side is our-build |
| 2026-10-26 09:57 | product | 380 | 36.58% | **FAIL** | `bbc651f3-dirty` |  |
| 2026-10-26 10:03 | product | 768 | 29.82% | **FAIL** | `bbc651f3-dirty` |  |
| 2026-10-26 10:07 | product | 380 | 35.07% | **FAIL** | `bbc651f3-dirty` |  |
| 2026-10-26 10:11 | product | 1440 | 19.95% | **FAIL** | `bbc651f3-dirty` |  |
| 2026-10-26 10:12 | product | 1440 | 20.52% | **FAIL** | `bbc651f3-dirty` |  |
| 2026-10-26 10:14 | product | 768 | 29.82% | **FAIL** | `bbc651f3-dirty` |  |
| 2026-10-26 10:17 | category | 380 | n/a | REFUSED | `e9cdc5ef-dirty` | live side is our-build |
| 2026-10-26 10:17 | category | 768 | n/a | REFUSED | `e9cdc5ef-dirty` | live side is our-build |
| 2026-10-26 10:17 | category | 1440 | n/a | REFUSED | `e9cdc5ef-dirty` | live side is our-build |
| 2026-10-26 11:27 | product | 380 | n/a | REFUSED | `ac9e195d-dirty` | live side is our-build |
| 2026-10-26 11:28 | product | 768 | n/a | REFUSED | `ac9e195d-dirty` | live side is our-build |
| 2026-10-26 11:28 | product | 1440 | n/a | REFUSED | `ac9e195d-dirty` | live side is our-build |
| 2026-10-26 11:28 | category | 380 | n/a | REFUSED | `ac9e195d-dirty` | live side is our-build |
| 2026-10-26 11:28 | category | 768 | n/a | REFUSED | `ac9e195d-dirty` | live side is our-build |
| 2026-10-26 11:29 | category | 1440 | n/a | REFUSED | `ac9e195d-dirty` | live side is our-build |
| 2026-10-26 12:29 | home | 380 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 12:29 | home | 768 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 12:29 | home | 1440 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 12:29 | home | 380 | 29.22% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:31 | home | 768 | 27.26% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:33 | home | 1440 | 20.50% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:35 | home | 380 | 29.28% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:37 | home | 768 | 27.26% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:39 | home | 1440 | 20.50% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:41 | product | 380 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 12:41 | product | 768 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 12:41 | product | 1440 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 12:44 | product | 380 | 29.02% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:47 | product | 768 | 23.20% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:49 | product | 1440 | 12.75% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:51 | product | 380 | 29.02% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:53 | product | 768 | 23.20% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:55 | product | 1440 | 12.56% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 12:57 | category | 380 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 12:57 | category | 768 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 12:57 | category | 1440 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 13:25 | home | 380 | 29.28% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:27 | home | 768 | 27.26% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:29 | home | 1440 | 20.50% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:31 | home | 380 | 29.28% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:33 | home | 768 | 27.26% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:35 | home | 1440 | 20.50% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:37 | product | 380 | n/a | REFUSED | `d401a98d-dirty` | live side is unknown |
| 2026-10-26 13:37 | product | 768 | n/a | REFUSED | `d401a98d-dirty` | live side is unknown |
| 2026-10-26 13:37 | product | 1440 | n/a | REFUSED | `d401a98d-dirty` | live side is unknown |
| 2026-10-26 13:38 | product | 380 | 29.02% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:40 | product | 768 | 23.20% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:43 | product | 1440 | 12.75% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:45 | product | 380 | 29.02% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:47 | product | 768 | 23.20% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:49 | product | 1440 | 12.75% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:52 | product | 380 | 28.72% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:54 | product | 768 | 23.20% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:56 | product | 1440 | 12.75% | **FAIL** | `d401a98d-dirty` |  |
| 2026-10-26 13:58 | category | 380 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 13:58 | category | 768 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 13:58 | category | 1440 | n/a | REFUSED | `d401a98d-dirty` | live side is our-build |
| 2026-10-26 14:25 | home | 380 | n/a | REFUSED | `4b28daf9-dirty` | live side is our-build |
| 2026-10-26 14:26 | home | 768 | n/a | REFUSED | `4b28daf9-dirty` | live side is our-build |
| 2026-10-26 14:26 | home | 1440 | n/a | REFUSED | `4b28daf9-dirty` | live side is our-build |
| 2026-10-26 14:26 | product | 380 | n/a | REFUSED | `4b28daf9-dirty` | live side is our-build |
| 2026-10-26 14:27 | product | 768 | n/a | REFUSED | `4b28daf9-dirty` | live side is our-build |
| 2026-10-26 14:27 | product | 1440 | n/a | REFUSED | `4b28daf9-dirty` | live side is our-build |
| 2026-10-26 14:27 | category | 380 | n/a | REFUSED | `4b28daf9-dirty` | live side is our-build |
| 2026-10-26 14:28 | category | 768 | n/a | REFUSED | `4b28daf9-dirty` | live side is our-build |
| 2026-10-26 14:28 | category | 1440 | n/a | REFUSED | `4b28daf9-dirty` | live side is our-build |
| 2026-10-26 14:55 | home | 380 | 29.28% | **FAIL** | `80f77104-dirty` |  |
| 2026-10-26 14:57 | home | 768 | 27.26% | **FAIL** | `80f77104-dirty` |  |
| 2026-10-26 14:59 | home | 1440 | 20.50% | **FAIL** | `80f77104-dirty` |  |
| 2026-10-26 15:01 | product | 380 | n/a | REFUSED | `80f77104-dirty` | live side is our-build |
| 2026-10-26 15:01 | product | 768 | n/a | REFUSED | `80f77104-dirty` | live side is our-build |
| 2026-10-26 15:01 | product | 1440 | n/a | REFUSED | `80f77104-dirty` | live side is our-build |
| 2026-10-26 15:02 | category | 380 | n/a | REFUSED | `80f77104-dirty` | live side is our-build |
| 2026-10-26 15:02 | category | 768 | n/a | REFUSED | `80f77104-dirty` | live side is our-build |
| 2026-10-26 15:02 | category | 1440 | n/a | REFUSED | `80f77104-dirty` | live side is our-build |
| 2026-10-26 15:44 | home | 380 | n/a | REFUSED | `f89bc038-dirty` | live side is our-build |
| 2026-10-26 15:44 | home | 768 | n/a | REFUSED | `f89bc038-dirty` | live side is our-build |
| 2026-10-26 15:45 | home | 1440 | n/a | REFUSED | `f89bc038-dirty` | live side is our-build |
| 2026-10-26 15:48 | product | 380 | 36.17% | **FAIL** | `f89bc038-dirty` |  |
| 2026-10-26 15:51 | product | 768 | 10.62% | PASS | `f89bc038-dirty` |  |
| 2026-10-26 15:54 | product | 380 | n/a | REFUSED | `f89bc038-dirty` | live side is unknown |
| 2026-10-26 15:54 | product | 768 | n/a | REFUSED | `f89bc038-dirty` | live side is unknown |
| 2026-10-26 15:54 | product | 1440 | n/a | REFUSED | `f89bc038-dirty` | live side is unknown |
| 2026-10-26 15:55 | category | 380 | n/a | REFUSED | `f89bc038-dirty` | live side is unknown |
| 2026-10-26 15:55 | category | 768 | n/a | REFUSED | `f89bc038-dirty` | live side is unknown |
| 2026-10-26 15:55 | category | 1440 | n/a | REFUSED | `f89bc038-dirty` | live side is unknown |
| 2026-10-26 16:25 | home | 380 | 62.60% | **FAIL** | `0362cd10-dirty` |  |
| 2026-10-26 16:49 | home | 768 | 35.41% | **FAIL** | `0362cd10-dirty` |  |
| 2026-10-26 16:51 | home | 1440 | 26.99% | **FAIL** | `0362cd10-dirty` |  |
| 2026-10-26 16:55 | product | 380 | n/a | REFUSED | `0362cd10-dirty` | live side is our-build |
| 2026-10-26 16:55 | product | 768 | n/a | REFUSED | `0362cd10-dirty` | live side is our-build |
| 2026-10-26 16:55 | product | 1440 | n/a | REFUSED | `0362cd10-dirty` | live side is our-build |
| 2026-10-26 18:19 | product | 380 | n/a | REFUSED | `f30538c1-dirty` | live side is our-build |
| 2026-10-26 18:19 | product | 768 | n/a | REFUSED | `f30538c1-dirty` | live side is our-build |
| 2026-10-26 18:19 | product | 1440 | n/a | REFUSED | `f30538c1-dirty` | live side is our-build |
| 2026-10-26 18:21 | product | 380 | 43.83% | **FAIL** | `f30538c1-dirty` |  |
| 2026-10-26 18:24 | product | 768 | 10.62% | PASS | `f30538c1-dirty` |  |
| 2026-10-27 11:05 | product | 380 | n/a | REFUSED | `96a04259-dirty` | live side is unknown |
| 2026-10-27 11:05 | product | 768 | n/a | REFUSED | `96a04259-dirty` | live side is unknown |
| 2026-10-27 11:05 | product | 1440 | n/a | REFUSED | `96a04259-dirty` | live side is unknown |
| 2026-10-27 11:08 | category | 380 | n/a | REFUSED | `418c188b-dirty` | live side is unknown |
| 2026-10-27 11:08 | category | 768 | n/a | REFUSED | `418c188b-dirty` | live side is unknown |
| 2026-10-27 11:08 | category | 1440 | n/a | REFUSED | `418c188b-dirty` | live side is unknown |
| 2026-10-27 11:36 | product | 380 | n/a | REFUSED | `a9f6b7ee-dirty` | live side is unknown |
| 2026-10-27 12:03 | home | 380 | n/a | REFUSED | `584cf38e-dirty` | live side is unknown |
| 2026-10-27 12:03 | home | 768 | n/a | REFUSED | `584cf38e-dirty` | live side is unknown |
| 2026-10-27 12:03 | home | 1440 | n/a | REFUSED | `584cf38e-dirty` | live side is unknown |
| 2026-10-27 12:08 | product | 380 | 43.58% | **FAIL** | `584cf38e-dirty` |  |
| 2026-10-27 12:10 | product | 768 | 33.72% | **FAIL** | `584cf38e-dirty` |  |
| 2026-10-27 12:13 | product | 1440 | 22.49% | **FAIL** | `584cf38e-dirty` |  |
| 2026-10-27 12:15 | product | 380 | n/a | REFUSED | `584cf38e-dirty` | live side is our-build |
| 2026-10-27 12:15 | product | 768 | n/a | REFUSED | `584cf38e-dirty` | live side is our-build |
| 2026-10-27 12:15 | product | 1440 | n/a | REFUSED | `584cf38e-dirty` | live side is our-build |
| 2026-10-27 12:46 | home | 380 | n/a | REFUSED | `e1287d51-dirty` | live side is our-build |
| 2026-10-27 12:47 | home | 768 | n/a | REFUSED | `e1287d51-dirty` | live side is our-build |
| 2026-10-27 12:47 | home | 1440 | n/a | REFUSED | `e1287d51-dirty` | live side is our-build |
| 2026-10-27 12:47 | product | 380 | n/a | REFUSED | `e1287d51-dirty` | live side is our-build |
| 2026-10-27 12:47 | product | 768 | n/a | REFUSED | `e1287d51-dirty` | live side is our-build |
| 2026-10-27 12:47 | product | 1440 | n/a | REFUSED | `e1287d51-dirty` | live side is our-build |
| 2026-10-27 12:49 | category | 380 | n/a | REFUSED | `e1287d51-dirty` | live side is our-build |
| 2026-10-27 12:49 | category | 768 | n/a | REFUSED | `e1287d51-dirty` | live side is our-build |
| 2026-10-27 12:49 | category | 1440 | n/a | REFUSED | `e1287d51-dirty` | live side is our-build |
| 2026-10-27 14:41 | home | 380 | n/a | REFUSED | `3d922add-dirty` | live side is our-build |
| 2026-10-27 14:41 | cart | 380 | n/a | REFUSED | `3d922add-dirty` | live side is our-build |
| 2026-10-27 15:30 | home | 380 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 15:30 | home | 768 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 15:30 | home | 1440 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 15:31 | product | 380 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 15:31 | product | 768 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 15:32 | product | 1440 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 15:32 | category | 380 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 15:32 | category | 768 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 15:32 | category | 1440 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 16:06 | product | 380 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 16:06 | product | 768 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 16:06 | product | 1440 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 16:08 | category | 380 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 16:08 | category | 768 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 16:08 | category | 1440 | n/a | REFUSED | `5b73e132-dirty` | live side is our-build |
| 2026-10-27 16:51 | home | 380 | n/a | REFUSED | `1340dd33-dirty` | live side is our-build |
| 2026-10-27 16:51 | home | 768 | n/a | REFUSED | `1340dd33-dirty` | live side is our-build |
| 2026-10-27 16:51 | home | 1440 | n/a | REFUSED | `1340dd33-dirty` | live side is our-build |
| 2026-10-27 16:52 | product | 380 | n/a | REFUSED | `0b187640-dirty` | live side is our-build |
| 2026-10-27 16:52 | product | 768 | n/a | REFUSED | `0b187640-dirty` | live side is our-build |
| 2026-10-27 16:53 | product | 1440 | n/a | REFUSED | `0b187640-dirty` | live side is our-build |
| 2026-10-27 16:58 | product | 380 | 43.83% | **FAIL** | `0b187640-dirty` |  |
| 2026-10-27 17:00 | product | 768 | 33.31% | **FAIL** | `0b187640-dirty` |  |
| 2026-10-27 17:03 | product | 1440 | 22.49% | **FAIL** | `0b187640-dirty` |  |
| 2026-10-27 17:05 | category | 380 | n/a | REFUSED | `0b187640-dirty` | live side is unknown |
| 2026-10-27 17:05 | category | 768 | n/a | REFUSED | `0b187640-dirty` | live side is unknown |
| 2026-10-27 17:05 | category | 1440 | n/a | REFUSED | `0b187640-dirty` | live side is unknown |
| 2026-10-27 17:38 | home | 380 | n/a | REFUSED | `0b187640-dirty` | live side is our-build |
| 2026-10-27 17:38 | home | 768 | n/a | REFUSED | `0b187640-dirty` | live side is our-build |
| 2026-10-27 17:38 | home | 1440 | n/a | REFUSED | `0b187640-dirty` | live side is our-build |
| 2026-10-27 17:42 | product | 380 | n/a | REFUSED | `486db785-dirty` | live side is our-build |
| 2026-10-27 17:42 | product | 768 | n/a | REFUSED | `486db785-dirty` | live side is our-build |
| 2026-10-27 17:42 | product | 1440 | n/a | REFUSED | `486db785-dirty` | live side is our-build |
| 2026-10-27 17:45 | product | 380 | 43.83% | **FAIL** | `486db785-dirty` |  |
| 2026-10-27 17:47 | product | 768 | 33.30% | **FAIL** | `486db785-dirty` |  |
| 2026-10-27 17:50 | product | 1440 | 22.44% | **FAIL** | `486db785-dirty` |  |
| 2026-10-27 17:52 | product | 380 | 43.45% | **FAIL** | `486db785-dirty` |  |
| 2026-10-27 17:55 | product | 768 | 33.30% | **FAIL** | `486db785-dirty` |  |
| 2026-10-27 17:57 | product | 1440 | 22.44% | **FAIL** | `486db785-dirty` |  |
| 2026-10-27 17:59 | product | 380 | 43.93% | **FAIL** | `486db785-dirty` |  |
| 2026-10-27 18:01 | product | 768 | 33.30% | **FAIL** | `486db785-dirty` |  |
| 2026-10-27 18:03 | product | 1440 | 22.44% | **FAIL** | `486db785-dirty` |  |
| 2026-10-27 18:05 | category | 380 | n/a | REFUSED | `486db785-dirty` | live side is our-build |
| 2026-10-27 18:05 | category | 768 | n/a | REFUSED | `486db785-dirty` | live side is our-build |
| 2026-10-27 18:05 | category | 1440 | n/a | REFUSED | `486db785-dirty` | live side is our-build |
| 2026-10-27 18:30 | home | 380 | n/a | REFUSED | `9524dd6d-dirty` | live side is our-build |
| 2026-10-27 18:30 | home | 768 | n/a | REFUSED | `9524dd6d-dirty` | live side is our-build |
| 2026-10-27 18:30 | home | 1440 | n/a | REFUSED | `9524dd6d-dirty` | live side is our-build |
| 2026-10-27 18:31 | product | 380 | n/a | REFUSED | `d1883ad8-dirty` | live side is our-build |
| 2026-10-27 18:31 | product | 768 | n/a | REFUSED | `d1883ad8-dirty` | live side is our-build |
| 2026-10-27 18:31 | product | 1440 | n/a | REFUSED | `d1883ad8-dirty` | live side is our-build |
| 2026-10-27 18:32 | category | 380 | n/a | REFUSED | `df66ef91-dirty` | live side is our-build |
| 2026-10-27 18:32 | category | 768 | n/a | REFUSED | `df66ef91-dirty` | live side is our-build |
| 2026-10-27 18:32 | category | 1440 | n/a | REFUSED | `df66ef91-dirty` | live side is our-build |
| 2026-10-27 19:17 | home | 380 | n/a | REFUSED | `fc51f035-dirty` | live side is unknown |
| 2026-10-27 19:17 | home | 768 | n/a | REFUSED | `fc51f035-dirty` | live side is unknown |
| 2026-10-27 19:17 | home | 1440 | n/a | REFUSED | `fc51f035-dirty` | live side is unknown |
| 2026-10-27 20:06 | home | 380 | n/a | REFUSED | `19cb1b73-dirty` | live side is unknown |
| 2026-10-27 20:06 | home | 768 | n/a | REFUSED | `19cb1b73-dirty` | live side is unknown |
| 2026-10-27 20:06 | home | 1440 | n/a | REFUSED | `19cb1b73-dirty` | live side is unknown |
| 2026-10-27 20:07 | product | 380 | n/a | REFUSED | `8420df84-dirty` | live side is unknown |
| 2026-10-27 20:07 | product | 768 | n/a | REFUSED | `8420df84-dirty` | live side is unknown |
| 2026-10-27 20:07 | product | 1440 | n/a | REFUSED | `8420df84-dirty` | live side is unknown |
| 2026-10-27 20:07 | category | 380 | n/a | REFUSED | `8420df84-dirty` | live side is unknown |
| 2026-10-27 20:07 | category | 768 | n/a | REFUSED | `8420df84-dirty` | live side is unknown |
| 2026-10-27 20:07 | category | 1440 | n/a | REFUSED | `8420df84-dirty` | live side is unknown |
| 2026-10-27 20:44 | home | 380 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 20:44 | home | 768 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 20:44 | home | 1440 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 20:45 | product | 380 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 20:45 | product | 768 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 20:45 | product | 1440 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 20:46 | category | 380 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 20:46 | category | 768 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 20:46 | category | 1440 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 21:48 | product | 380 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 21:48 | product | 768 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 21:48 | product | 1440 | n/a | REFUSED | `ce5cc3de-dirty` | live side is our-build |
| 2026-10-27 21:51 | product | 380 | 43.45% | **FAIL** | `ce5cc3de-dirty` |  |
| 2026-10-27 21:54 | product | 768 | 33.31% | **FAIL** | `ce5cc3de-dirty` |  |
| 2026-10-27 21:56 | product | 1440 | 22.44% | **FAIL** | `ce5cc3de-dirty` |  |
| 2026-10-27 21:58 | product | 380 | 43.83% | **FAIL** | `ce5cc3de-dirty` |  |
| 2026-10-27 22:00 | product | 768 | 33.31% | **FAIL** | `ce5cc3de-dirty` |  |
| 2026-10-27 22:03 | product | 1440 | 22.44% | **FAIL** | `ce5cc3de-dirty` |  |
| 2026-10-27 22:04 | category | 380 | n/a | REFUSED | `ce5cc3de-dirty` | live side is unknown |
| 2026-10-27 22:05 | category | 768 | n/a | REFUSED | `ce5cc3de-dirty` | live side is unknown |
| 2026-10-27 22:05 | category | 1440 | n/a | REFUSED | `ce5cc3de-dirty` | live side is unknown |
| 2026-10-27 22:46 | home | 380 | n/a | REFUSED | `1618784a-dirty` | live side is our-build |
| 2026-10-27 22:46 | home | 768 | n/a | REFUSED | `1618784a-dirty` | live side is our-build |
| 2026-10-27 22:46 | home | 1440 | n/a | REFUSED | `1618784a-dirty` | live side is our-build |
