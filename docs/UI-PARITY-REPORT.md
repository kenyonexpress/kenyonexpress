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
| 2026-10-27 22:47 | product | 380 | n/a | REFUSED | `749f7abd-dirty` | live side is our-build |
| 2026-10-27 22:47 | product | 768 | n/a | REFUSED | `749f7abd-dirty` | live side is our-build |
| 2026-10-27 22:47 | product | 1440 | n/a | REFUSED | `749f7abd-dirty` | live side is our-build |
| 2026-10-27 22:53 | product | 380 | 43.45% | **FAIL** | `749f7abd-dirty` |  |
| 2026-10-27 22:55 | product | 768 | 33.31% | **FAIL** | `749f7abd-dirty` |  |
| 2026-10-27 22:57 | product | 1440 | 22.44% | **FAIL** | `749f7abd-dirty` |  |
| 2026-10-27 23:00 | product | 380 | 43.83% | **FAIL** | `749f7abd-dirty` |  |
| 2026-10-27 23:02 | product | 768 | 33.31% | **FAIL** | `749f7abd-dirty` |  |
| 2026-10-27 23:05 | product | 1440 | 22.44% | **FAIL** | `749f7abd-dirty` |  |
| 2026-10-27 23:07 | category | 380 | n/a | REFUSED | `749f7abd-dirty` | live side is unknown |
| 2026-10-27 23:07 | category | 768 | n/a | REFUSED | `749f7abd-dirty` | live side is unknown |
| 2026-10-27 23:07 | category | 1440 | n/a | REFUSED | `749f7abd-dirty` | live side is unknown |
| 2026-10-27 23:25 | home | 380 | n/a | REFUSED | `ea0bf09b-dirty` | live side is our-build |
| 2026-10-27 23:25 | home | 768 | n/a | REFUSED | `ea0bf09b-dirty` | live side is our-build |
| 2026-10-27 23:25 | home | 1440 | n/a | REFUSED | `ea0bf09b-dirty` | live side is our-build |
| 2026-10-27 23:29 | product | 380 | n/a | REFUSED | `54dd6be2-dirty` | live side is our-build |
| 2026-10-27 23:29 | product | 768 | n/a | REFUSED | `54dd6be2-dirty` | live side is our-build |
| 2026-10-27 23:29 | product | 1440 | n/a | REFUSED | `54dd6be2-dirty` | live side is our-build |
| 2026-10-27 23:30 | product | 380 | 89.84% | **FAIL** | `54dd6be2-dirty` |  |
| 2026-10-27 23:32 | product | 768 | 83.07% | **FAIL** | `54dd6be2-dirty` |  |
| 2026-10-27 23:35 | product | 1440 | 92.44% | **FAIL** | `54dd6be2-dirty` |  |
| 2026-10-27 23:37 | product | 380 | 43.45% | **FAIL** | `54dd6be2-dirty` |  |
| 2026-10-27 23:39 | product | 768 | 33.30% | **FAIL** | `54dd6be2-dirty` |  |
| 2026-10-27 23:41 | product | 1440 | 22.44% | **FAIL** | `54dd6be2-dirty` |  |
| 2026-10-27 23:43 | category | 380 | n/a | REFUSED | `54dd6be2-dirty` | live side is our-build |
| 2026-10-27 23:43 | category | 768 | n/a | REFUSED | `54dd6be2-dirty` | live side is our-build |
| 2026-10-27 23:43 | category | 1440 | n/a | REFUSED | `54dd6be2-dirty` | live side is our-build |
| 2026-10-28 00:31 | home | 380 | n/a | REFUSED | `54dd6be2-dirty` | live side is our-build |
| 2026-10-28 00:31 | home | 768 | n/a | REFUSED | `54dd6be2-dirty` | live side is our-build |
| 2026-10-28 00:32 | home | 1440 | n/a | REFUSED | `54dd6be2-dirty` | live side is our-build |
| 2026-10-28 00:32 | product | 380 | n/a | REFUSED | `04f4c6c3-dirty` | live side is our-build |
| 2026-10-28 00:32 | product | 768 | n/a | REFUSED | `04f4c6c3-dirty` | live side is our-build |
| 2026-10-28 00:32 | product | 1440 | n/a | REFUSED | `04f4c6c3-dirty` | live side is our-build |
| 2026-10-28 00:36 | category | 380 | n/a | REFUSED | `8d4b6118-dirty` | live side is our-build |
| 2026-10-28 00:36 | category | 768 | n/a | REFUSED | `8d4b6118-dirty` | live side is our-build |
| 2026-10-28 00:36 | category | 1440 | n/a | REFUSED | `8d4b6118-dirty` | live side is our-build |
| 2026-10-28 01:22 | home | 380 | n/a | REFUSED | `8d4b6118-dirty` | live side is our-build |
| 2026-10-28 01:22 | home | 768 | n/a | REFUSED | `8d4b6118-dirty` | live side is our-build |
| 2026-10-28 01:22 | home | 1440 | n/a | REFUSED | `8d4b6118-dirty` | live side is our-build |
| 2026-10-28 01:22 | home | 1440 | n/a | REFUSED | `8d4b6118-dirty` | live side is our-build |
| 2026-10-28 01:23 | product | 380 | n/a | REFUSED | `74a65b71-dirty` | live side is our-build |
| 2026-10-28 01:23 | product | 768 | n/a | REFUSED | `74a65b71-dirty` | live side is our-build |
| 2026-10-28 01:23 | product | 1440 | n/a | REFUSED | `74a65b71-dirty` | live side is our-build |
| 2026-10-28 01:28 | product | 380 | 89.22% | **FAIL** | `74a65b71-dirty` |  |
| 2026-10-28 01:29 | product | 768 | 83.07% | **FAIL** | `74a65b71-dirty` |  |
| 2026-10-28 01:32 | product | 1440 | 92.44% | **FAIL** | `74a65b71-dirty` |  |
| 2026-10-28 01:35 | product | 380 | 89.22% | **FAIL** | `74a65b71-dirty` |  |
| 2026-10-28 01:38 | product | 768 | 83.07% | **FAIL** | `74a65b71-dirty` |  |
| 2026-10-28 01:41 | product | 1440 | 92.44% | **FAIL** | `74a65b71-dirty` |  |
| 2026-10-28 01:43 | category | 380 | n/a | REFUSED | `74a65b71-dirty` | live side is our-build |
| 2026-10-28 01:43 | category | 768 | n/a | REFUSED | `74a65b71-dirty` | live side is our-build |
| 2026-10-28 01:43 | category | 1440 | n/a | REFUSED | `74a65b71-dirty` | live side is our-build |
| 2026-10-28 02:48 | home | 380 | n/a | REFUSED | `b6a70710-dirty` | live side is our-build |
| 2026-10-28 02:48 | home | 768 | n/a | REFUSED | `b6a70710-dirty` | live side is our-build |
| 2026-10-28 02:48 | home | 1440 | n/a | REFUSED | `b6a70710-dirty` | live side is our-build |
| 2026-10-28 03:04 | category | 380 | n/a | REFUSED | `9f7300ea-dirty` | live side is our-build |
| 2026-10-28 03:04 | category | 768 | n/a | REFUSED | `9f7300ea-dirty` | live side is our-build |
| 2026-10-28 03:04 | category | 1440 | n/a | REFUSED | `9f7300ea-dirty` | live side is our-build |
| 2026-10-28 03:45 | home | 1440 | n/a | REFUSED | `6ec3d156-dirty` | live side is our-build |
| 2026-10-28 03:46 | product | 380 | n/a | REFUSED | `6ec3d156-dirty` | live side is our-build |
| 2026-10-28 03:46 | product | 768 | n/a | REFUSED | `6ec3d156-dirty` | live side is our-build |
| 2026-10-28 03:46 | product | 1440 | n/a | REFUSED | `6ec3d156-dirty` | live side is our-build |
| 2026-10-28 04:29 | home | 380 | n/a | REFUSED | `a1e009da-dirty` | live side is unknown |
| 2026-10-28 04:29 | home | 768 | n/a | REFUSED | `a1e009da-dirty` | live side is unknown |
| 2026-10-28 04:30 | home | 1440 | n/a | REFUSED | `a1e009da-dirty` | live side is unknown |
| 2026-10-28 04:30 | product | 380 | n/a | REFUSED | `26f0e7d1-dirty` | live side is unknown |
| 2026-10-28 04:30 | product | 768 | n/a | REFUSED | `26f0e7d1-dirty` | live side is unknown |
| 2026-10-28 04:30 | product | 1440 | n/a | REFUSED | `26f0e7d1-dirty` | live side is unknown |
| 2026-10-28 04:31 | category | 380 | n/a | REFUSED | `26f0e7d1-dirty` | live side is unknown |
| 2026-10-28 04:31 | category | 768 | n/a | REFUSED | `26f0e7d1-dirty` | live side is unknown |
| 2026-10-28 04:31 | category | 1440 | n/a | REFUSED | `26f0e7d1-dirty` | live side is unknown |
| 2026-10-28 04:59 | home | 380 | n/a | REFUSED | `46b22a72-dirty` | live side is our-build |
| 2026-10-28 04:59 | home | 768 | n/a | REFUSED | `46b22a72-dirty` | live side is our-build |
| 2026-10-28 04:59 | home | 1440 | n/a | REFUSED | `46b22a72-dirty` | live side is our-build |
| 2026-10-28 05:02 | product | 380 | n/a | REFUSED | `e9157233-dirty` | live side is our-build |
| 2026-10-28 05:02 | product | 768 | n/a | REFUSED | `e9157233-dirty` | live side is our-build |
| 2026-10-28 05:02 | product | 1440 | n/a | REFUSED | `e9157233-dirty` | live side is our-build |
| 2026-10-28 05:03 | category | 380 | n/a | REFUSED | `e9157233-dirty` | live side is our-build |
| 2026-10-28 05:03 | category | 768 | n/a | REFUSED | `e9157233-dirty` | live side is our-build |
| 2026-10-28 05:03 | category | 1440 | n/a | REFUSED | `e9157233-dirty` | live side is our-build |
| 2026-10-28 05:55 | home | 380 | n/a | REFUSED | `e9157233-dirty` | live side is our-build |
| 2026-10-28 05:55 | home | 768 | n/a | REFUSED | `e9157233-dirty` | live side is our-build |
| 2026-10-28 05:55 | home | 1440 | n/a | REFUSED | `e9157233-dirty` | live side is our-build |
| 2026-10-28 05:56 | product | 380 | n/a | REFUSED | `7827d110-dirty` | live side is our-build |
| 2026-10-28 05:56 | product | 768 | n/a | REFUSED | `7827d110-dirty` | live side is our-build |
| 2026-10-28 05:56 | product | 1440 | n/a | REFUSED | `7827d110-dirty` | live side is our-build |
| 2026-10-28 05:57 | category | 380 | n/a | REFUSED | `7827d110-dirty` | live side is our-build |
| 2026-10-28 05:57 | category | 768 | n/a | REFUSED | `7827d110-dirty` | live side is our-build |
| 2026-10-28 05:57 | category | 1440 | n/a | REFUSED | `7827d110-dirty` | live side is our-build |
| 2026-10-28 06:44 | home | 380 | n/a | REFUSED | `7655a383-dirty` | live side is our-build |
| 2026-10-28 06:45 | home | 768 | n/a | REFUSED | `7655a383-dirty` | live side is our-build |
| 2026-10-28 06:46 | home | 1440 | n/a | REFUSED | `7655a383-dirty` | live side is our-build |
| 2026-10-28 06:47 | product | 380 | n/a | REFUSED | `fd2a5738-dirty` | live side is our-build |
| 2026-10-28 06:47 | product | 768 | n/a | REFUSED | `fd2a5738-dirty` | live side is our-build |
| 2026-10-28 06:47 | product | 1440 | n/a | REFUSED | `fd2a5738-dirty` | live side is our-build |
| 2026-10-28 06:48 | category | 380 | n/a | REFUSED | `fd2a5738-dirty` | live side is our-build |
| 2026-10-28 06:48 | category | 768 | n/a | REFUSED | `fd2a5738-dirty` | live side is our-build |
| 2026-10-28 06:48 | category | 1440 | n/a | REFUSED | `fd2a5738-dirty` | live side is our-build |
| 2026-10-28 07:29 | product | 380 | n/a | REFUSED | `fd71eff1-dirty` | live side is our-build |
| 2026-10-28 07:29 | product | 768 | n/a | REFUSED | `fd71eff1-dirty` | live side is our-build |
| 2026-10-28 07:29 | product | 1440 | n/a | REFUSED | `fd71eff1-dirty` | live side is our-build |
| 2026-10-28 08:08 | product | 380 | n/a | REFUSED | `784defc9-dirty` | live side is our-build |
| 2026-10-28 08:08 | product | 768 | n/a | REFUSED | `784defc9-dirty` | live side is our-build |
| 2026-10-28 08:08 | product | 1440 | n/a | REFUSED | `784defc9-dirty` | live side is our-build |
| 2026-10-28 08:09 | category | 380 | n/a | REFUSED | `17396518-dirty` | live side is our-build |
| 2026-10-28 08:09 | category | 768 | n/a | REFUSED | `17396518-dirty` | live side is our-build |
| 2026-10-28 08:09 | category | 1440 | n/a | REFUSED | `17396518-dirty` | live side is our-build |
| 2026-10-28 14:56 | product | 380 | n/a | REFUSED | `0204045f-dirty` | live side is our-build |
| 2026-10-28 14:56 | product | 768 | n/a | REFUSED | `0204045f-dirty` | live side is our-build |
| 2026-10-28 14:56 | product | 1440 | n/a | REFUSED | `0204045f-dirty` | live side is our-build |
| 2026-10-28 14:59 | product | 380 | 36.58% | **FAIL** | `0204045f-dirty` |  |
| 2026-10-28 15:03 | product | 768 | 30.62% | **FAIL** | `0204045f-dirty` |  |
| 2026-10-28 15:05 | product | 1440 | 20.52% | **FAIL** | `0204045f-dirty` |  |
| 2026-10-28 15:07 | product | 380 | 36.58% | **FAIL** | `0204045f-dirty` |  |
| 2026-10-28 15:10 | product | 768 | 29.82% | **FAIL** | `0204045f-dirty` |  |
| 2026-10-28 15:12 | product | 1440 | 20.52% | **FAIL** | `0204045f-dirty` |  |
| 2026-10-28 15:14 | category | 380 | n/a | REFUSED | `0204045f-dirty` | live side is our-build |
| 2026-10-28 15:15 | category | 768 | n/a | REFUSED | `0204045f-dirty` | live side is our-build |
| 2026-10-28 15:15 | category | 1440 | n/a | REFUSED | `0204045f-dirty` | live side is our-build |
| 2026-10-28 15:38 | home | 380 | 39.84% | **FAIL** | `876c5850-dirty` |  |
| 2026-10-28 15:41 | home | 768 | 36.52% | **FAIL** | `876c5850-dirty` |  |
| 2026-10-28 15:43 | home | 1440 | 27.53% | **FAIL** | `876c5850-dirty` |  |
| 2026-10-28 15:45 | home | 380 | 39.83% | **FAIL** | `876c5850-dirty` |  |
| 2026-10-28 15:47 | home | 768 | 36.52% | **FAIL** | `876c5850-dirty` |  |
| 2026-10-28 15:49 | home | 1440 | 27.52% | **FAIL** | `876c5850-dirty` |  |
| 2026-10-28 15:56 | product | 380 | 23.40% | **FAIL** | `b2baf519-dirty` |  |
| 2026-10-28 15:58 | product | 768 | 21.93% | **FAIL** | `b2baf519-dirty` |  |
| 2026-10-28 16:00 | product | 1440 | 16.50% | **FAIL** | `b2baf519-dirty` |  |
| 2026-10-28 16:02 | category | 380 | n/a | REFUSED | `b8d087d4-dirty` | live side is our-build |
| 2026-10-28 16:03 | category | 768 | n/a | REFUSED | `b8d087d4-dirty` | live side is our-build |
| 2026-10-28 16:03 | category | 1440 | n/a | REFUSED | `b8d087d4-dirty` | live side is our-build |
| 2026-10-28 16:25 | home | 380 | 39.85% | **FAIL** | `84895c3f-dirty` |  |
| 2026-10-28 16:27 | home | 768 | 36.53% | **FAIL** | `84895c3f-dirty` |  |
| 2026-10-28 16:30 | home | 1440 | 27.53% | **FAIL** | `84895c3f-dirty` |  |
| 2026-10-28 16:32 | product | 380 | n/a | REFUSED | `75d20bbb-dirty` | live side is our-build |
| 2026-10-28 16:32 | product | 768 | n/a | REFUSED | `75d20bbb-dirty` | live side is our-build |
| 2026-10-28 16:32 | product | 1440 | n/a | REFUSED | `75d20bbb-dirty` | live side is our-build |
| 2026-10-28 16:40 | category | 380 | n/a | REFUSED | `75d20bbb-dirty` | live side is our-build |
| 2026-10-28 16:41 | category | 768 | n/a | REFUSED | `75d20bbb-dirty` | live side is our-build |
| 2026-10-28 16:41 | category | 1440 | n/a | REFUSED | `75d20bbb-dirty` | live side is our-build |
| 2026-10-28 17:09 | home | 380 | 39.85% | **FAIL** | `6d32d6fe-dirty` |  |
| 2026-10-28 17:11 | home | 768 | 36.53% | **FAIL** | `6d32d6fe-dirty` |  |
| 2026-10-28 17:14 | home | 1440 | 27.53% | **FAIL** | `6d32d6fe-dirty` |  |
| 2026-10-28 17:16 | home | 380 | 39.85% | **FAIL** | `6d32d6fe-dirty` |  |
| 2026-10-28 17:18 | home | 768 | 36.53% | **FAIL** | `6d32d6fe-dirty` |  |
| 2026-10-28 17:20 | home | 1440 | 27.53% | **FAIL** | `6d32d6fe-dirty` |  |
| 2026-10-28 17:23 | product | 380 | 23.40% | **FAIL** | `c076085f-dirty` |  |
| 2026-10-28 17:25 | product | 768 | 21.93% | **FAIL** | `c076085f-dirty` |  |
| 2026-10-28 17:27 | product | 1440 | 16.50% | **FAIL** | `c076085f-dirty` |  |
| 2026-10-28 17:30 | product | 380 | 23.40% | **FAIL** | `c076085f-dirty` |  |
| 2026-10-28 17:33 | product | 768 | 21.93% | **FAIL** | `c076085f-dirty` |  |
| 2026-10-28 17:36 | product | 1440 | 15.89% | **FAIL** | `c076085f-dirty` |  |
| 2026-10-28 17:38 | category | 380 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 17:38 | category | 768 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 17:39 | category | 1440 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 18:12 | product | 380 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 18:12 | product | 768 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 18:12 | product | 1440 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 18:12 | category | 380 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 18:13 | category | 768 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 18:13 | category | 1440 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 18:38 | home | 380 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 18:38 | home | 768 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 18:38 | home | 1440 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 18:39 | home | 380 | 19.56% | **FAIL** | `cbffcfc7-dirty` |  |
| 2026-10-28 18:41 | home | 768 | 16.01% | **FAIL** | `cbffcfc7-dirty` |  |
| 2026-10-28 18:43 | home | 1440 | 11.67% | **FAIL** | `cbffcfc7-dirty` |  |
| 2026-10-28 18:48 | product | 380 | 22.50% | **FAIL** | `cbffcfc7-dirty` |  |
| 2026-10-28 18:52 | product | 768 | 22.80% | **FAIL** | `cbffcfc7-dirty` |  |
| 2026-10-28 18:55 | product | 1440 | 16.50% | **FAIL** | `cbffcfc7-dirty` |  |
| 2026-10-28 18:57 | product | 380 | 23.33% | **FAIL** | `cbffcfc7-dirty` |  |
| 2026-10-28 19:00 | product | 768 | 21.93% | **FAIL** | `cbffcfc7-dirty` |  |
| 2026-10-28 19:02 | product | 1440 | 16.50% | **FAIL** | `cbffcfc7-dirty` |  |
| 2026-10-28 19:04 | category | 380 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 19:04 | category | 768 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 19:04 | category | 1440 | n/a | REFUSED | `cbffcfc7-dirty` | live side is our-build |
| 2026-10-28 19:32 | home | 380 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 19:32 | home | 768 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 19:32 | home | 1440 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 19:33 | home | 380 | 39.83% | **FAIL** | `8aec4491-dirty` |  |
| 2026-10-28 19:35 | home | 768 | 36.52% | **FAIL** | `8aec4491-dirty` |  |
| 2026-10-28 19:37 | home | 1440 | 27.52% | **FAIL** | `8aec4491-dirty` |  |
| 2026-10-28 19:39 | home | 380 | 39.85% | **FAIL** | `8aec4491-dirty` |  |
| 2026-10-28 19:42 | home | 768 | 36.59% | **FAIL** | `8aec4491-dirty` |  |
| 2026-10-28 19:44 | home | 1440 | 27.52% | **FAIL** | `8aec4491-dirty` |  |
| 2026-10-28 19:46 | product | 380 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 19:46 | product | 768 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 19:46 | product | 1440 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 19:47 | category | 380 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 19:48 | category | 768 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 19:48 | category | 1440 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 20:24 | product | 380 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 20:24 | product | 768 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 20:24 | product | 1440 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 20:25 | product | 380 | 36.58% | **FAIL** | `8aec4491-dirty` |  |
| 2026-10-28 20:27 | product | 768 | 29.82% | **FAIL** | `8aec4491-dirty` |  |
| 2026-10-28 20:30 | product | 1440 | 20.52% | **FAIL** | `8aec4491-dirty` |  |
| 2026-10-28 20:33 | category | 380 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 20:33 | category | 768 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-28 20:33 | category | 1440 | n/a | REFUSED | `8aec4491-dirty` | live side is our-build |
| 2026-10-29 07:20 | product | 380 | 36.17% | **FAIL** | `243dcdee-dirty` |  |
| 2026-10-29 07:22 | product | 768 | 29.82% | **FAIL** | `243dcdee-dirty` |  |
| 2026-10-29 07:29 | product | 380 | 35.07% | **FAIL** | `243dcdee-dirty` |  |
| 2026-10-29 07:35 | product | 1440 | 19.95% | **FAIL** | `243dcdee-dirty` |  |
| 2026-10-29 21:36 | home | 380 | n/a | REFUSED | `0faad927-dirty` | live side is our-build |
| 2026-10-29 21:36 | home | 768 | n/a | REFUSED | `0faad927-dirty` | live side is our-build |
| 2026-10-29 21:36 | home | 1440 | n/a | REFUSED | `0faad927-dirty` | live side is our-build |
| 2026-10-29 21:37 | home | 380 | 35.60% | **FAIL** | `0faad927-dirty` |  |
| 2026-10-29 21:39 | home | 768 | 36.14% | **FAIL** | `0faad927-dirty` |  |
| 2026-10-29 21:41 | home | 1440 | 32.36% | **FAIL** | `0faad927-dirty` |  |
| 2026-10-29 21:44 | product | 380 | n/a | REFUSED | `6346c210-dirty` | live side is our-build |
| 2026-10-29 21:44 | product | 768 | n/a | REFUSED | `6346c210-dirty` | live side is our-build |
| 2026-10-29 21:44 | product | 1440 | n/a | REFUSED | `6346c210-dirty` | live side is our-build |
| 2026-10-29 21:47 | product | 380 | 43.72% | **FAIL** | `6346c210-dirty` |  |
| 2026-10-29 21:49 | product | 768 | 33.59% | **FAIL** | `6346c210-dirty` |  |
| 2026-10-29 21:51 | product | 1440 | 22.45% | **FAIL** | `6346c210-dirty` |  |
| 2026-10-29 21:54 | category | 380 | n/a | REFUSED | `10362200-dirty` | live side is our-build |
| 2026-10-29 21:54 | category | 768 | n/a | REFUSED | `10362200-dirty` | live side is our-build |
| 2026-10-29 21:54 | category | 1440 | n/a | REFUSED | `10362200-dirty` | live side is our-build |
| 2026-10-29 22:34 | home | 380 | 35.60% | **FAIL** | `855abce0-dirty` |  |
| 2026-10-29 22:37 | home | 768 | 36.21% | **FAIL** | `855abce0-dirty` |  |
| 2026-10-29 22:39 | home | 1440 | 32.36% | **FAIL** | `855abce0-dirty` |  |
| 2026-10-29 22:41 | product | 380 | n/a | REFUSED | `a4cca48e-dirty` | live side is our-build |
| 2026-10-29 22:41 | product | 768 | n/a | REFUSED | `a4cca48e-dirty` | live side is our-build |
| 2026-10-29 22:41 | product | 1440 | n/a | REFUSED | `a4cca48e-dirty` | live side is our-build |
| 2026-10-29 22:46 | product | 380 | 43.71% | **FAIL** | `a4cca48e-dirty` |  |
| 2026-10-29 22:49 | product | 768 | 33.58% | **FAIL** | `a4cca48e-dirty` |  |
| 2026-10-29 22:51 | product | 1440 | 22.45% | **FAIL** | `a4cca48e-dirty` |  |
| 2026-10-29 22:54 | product | 380 | 43.71% | **FAIL** | `a4cca48e-dirty` |  |
| 2026-10-29 22:55 | product | 768 | 33.59% | **FAIL** | `a4cca48e-dirty` |  |
| 2026-10-29 22:58 | product | 1440 | 22.45% | **FAIL** | `a4cca48e-dirty` |  |
| 2026-10-29 23:00 | category | 380 | n/a | REFUSED | `a4cca48e-dirty` | live side is our-build |
| 2026-10-29 23:00 | category | 768 | n/a | REFUSED | `a4cca48e-dirty` | live side is our-build |
| 2026-10-29 23:00 | category | 1440 | n/a | REFUSED | `a4cca48e-dirty` | live side is our-build |
| 2026-10-29 23:17 | home | 380 | 35.60% | **FAIL** | `975f4e3e-dirty` |  |
| 2026-10-29 23:20 | home | 768 | 36.14% | **FAIL** | `975f4e3e-dirty` |  |
| 2026-10-29 23:22 | home | 1440 | 32.36% | **FAIL** | `975f4e3e-dirty` |  |
| 2026-10-29 23:24 | home | 380 | 35.60% | **FAIL** | `975f4e3e-dirty` |  |
| 2026-10-29 23:26 | home | 768 | 36.14% | **FAIL** | `975f4e3e-dirty` |  |
| 2026-10-29 23:28 | home | 1440 | 32.36% | **FAIL** | `975f4e3e-dirty` |  |
| 2026-10-29 23:30 | product | 380 | n/a | REFUSED | `6c531ae7-dirty` | live side is our-build |
| 2026-10-29 23:30 | product | 768 | n/a | REFUSED | `6c531ae7-dirty` | live side is our-build |
| 2026-10-29 23:30 | product | 1440 | n/a | REFUSED | `6c531ae7-dirty` | live side is our-build |
| 2026-10-29 23:35 | product | 380 | 43.72% | **FAIL** | `6c531ae7-dirty` |  |
| 2026-10-29 23:37 | product | 768 | 33.59% | **FAIL** | `6c531ae7-dirty` |  |
| 2026-10-29 23:40 | product | 1440 | 22.45% | **FAIL** | `6c531ae7-dirty` |  |
| 2026-10-29 23:42 | product | 380 | 43.72% | **FAIL** | `6c531ae7-dirty` |  |
| 2026-10-29 23:44 | product | 768 | 33.59% | **FAIL** | `6c531ae7-dirty` |  |
| 2026-10-29 23:46 | product | 1440 | 22.45% | **FAIL** | `6c531ae7-dirty` |  |
| 2026-10-29 23:48 | category | 380 | n/a | REFUSED | `6c531ae7-dirty` | live side is our-build |
| 2026-10-29 23:48 | category | 768 | n/a | REFUSED | `6c531ae7-dirty` | live side is our-build |
| 2026-10-29 23:48 | category | 1440 | n/a | REFUSED | `6c531ae7-dirty` | live side is our-build |
| 2026-10-30 00:28 | home | 380 | 35.60% | **FAIL** | `55ee94cf-dirty` |  |
| 2026-10-30 00:31 | home | 768 | 36.14% | **FAIL** | `55ee94cf-dirty` |  |
| 2026-10-30 00:33 | home | 1440 | 32.35% | **FAIL** | `55ee94cf-dirty` |  |
| 2026-10-30 00:35 | home | 380 | 35.60% | **FAIL** | `55ee94cf-dirty` |  |
| 2026-10-30 00:37 | home | 768 | 36.14% | **FAIL** | `55ee94cf-dirty` |  |
| 2026-10-30 00:39 | home | 1440 | 32.36% | **FAIL** | `55ee94cf-dirty` |  |
| 2026-10-30 00:41 | product | 380 | n/a | REFUSED | `adce10cf-dirty` | live side is our-build |
| 2026-10-30 00:41 | product | 768 | n/a | REFUSED | `adce10cf-dirty` | live side is our-build |
| 2026-10-30 00:41 | product | 1440 | n/a | REFUSED | `adce10cf-dirty` | live side is our-build |
| 2026-10-30 00:43 | category | 380 | n/a | REFUSED | `adce10cf-dirty` | live side is our-build |
| 2026-10-30 00:43 | category | 768 | n/a | REFUSED | `adce10cf-dirty` | live side is our-build |
| 2026-10-30 00:43 | category | 1440 | n/a | REFUSED | `adce10cf-dirty` | live side is our-build |
| 2026-10-30 01:08 | home | 380 | 35.60% | **FAIL** | `3a91bac7-dirty` |  |
| 2026-10-30 01:11 | home | 768 | 36.14% | **FAIL** | `3a91bac7-dirty` |  |
| 2026-10-30 01:13 | home | 1440 | 32.36% | **FAIL** | `3a91bac7-dirty` |  |
| 2026-10-30 01:15 | home | 380 | 35.60% | **FAIL** | `3a91bac7-dirty` |  |
| 2026-10-30 01:17 | home | 768 | 36.14% | **FAIL** | `3a91bac7-dirty` |  |
| 2026-10-30 01:19 | home | 1440 | 32.36% | **FAIL** | `3a91bac7-dirty` |  |
| 2026-10-30 01:21 | product | 380 | n/a | REFUSED | `051fba44-dirty` | live side is our-build |
| 2026-10-30 01:21 | product | 768 | n/a | REFUSED | `051fba44-dirty` | live side is our-build |
| 2026-10-30 01:21 | product | 1440 | n/a | REFUSED | `051fba44-dirty` | live side is our-build |
| 2026-10-30 01:23 | product | 380 | 43.72% | **FAIL** | `051fba44-dirty` |  |
| 2026-10-30 01:26 | product | 768 | 33.59% | **FAIL** | `051fba44-dirty` |  |
| 2026-10-30 01:28 | product | 1440 | 22.45% | **FAIL** | `051fba44-dirty` |  |
| 2026-10-30 01:30 | product | 380 | 43.70% | **FAIL** | `051fba44-dirty` |  |
| 2026-10-30 01:33 | product | 768 | 33.58% | **FAIL** | `051fba44-dirty` |  |
| 2026-10-30 01:36 | product | 1440 | 22.45% | **FAIL** | `051fba44-dirty` |  |
| 2026-10-30 02:18 | product | 380 | 36.58% | **FAIL** | `9756db0d-dirty` |  |
| 2026-10-30 02:21 | product | 768 | 29.82% | **FAIL** | `9756db0d-dirty` |  |
| 2026-10-30 02:23 | product | 1440 | 20.52% | **FAIL** | `9756db0d-dirty` |  |
| 2026-10-30 02:25 | category | 380 | n/a | REFUSED | `34432828-dirty` | live side is our-build |
| 2026-10-30 02:25 | category | 768 | n/a | REFUSED | `34432828-dirty` | live side is our-build |
| 2026-10-30 02:25 | category | 1440 | n/a | REFUSED | `34432828-dirty` | live side is our-build |
| 2026-10-30 02:47 | home | 380 | 39.85% | **FAIL** | `34432828-dirty` |  |
| 2026-10-30 02:49 | home | 768 | 36.53% | **FAIL** | `34432828-dirty` |  |
| 2026-10-30 02:51 | home | 1440 | 27.53% | **FAIL** | `34432828-dirty` |  |
| 2026-10-30 02:54 | home | 380 | 39.85% | **FAIL** | `34432828-dirty` |  |
| 2026-10-30 02:56 | home | 768 | 36.53% | **FAIL** | `34432828-dirty` |  |
| 2026-10-30 02:58 | home | 1440 | 27.53% | **FAIL** | `34432828-dirty` |  |
| 2026-10-30 03:00 | product | 380 | n/a | REFUSED | `b5415489-dirty` | live side is our-build |
| 2026-10-30 03:00 | product | 768 | n/a | REFUSED | `b5415489-dirty` | live side is our-build |
| 2026-10-30 03:00 | product | 1440 | n/a | REFUSED | `b5415489-dirty` | live side is our-build |
| 2026-10-30 03:04 | product | 380 | 36.58% | **FAIL** | `b5415489-dirty` |  |
| 2026-10-30 03:07 | product | 768 | 29.82% | **FAIL** | `b5415489-dirty` |  |
| 2026-10-30 03:10 | product | 1440 | 20.52% | **FAIL** | `b5415489-dirty` |  |
| 2026-10-30 03:12 | product | 380 | 35.82% | **FAIL** | `b5415489-dirty` |  |
| 2026-10-30 03:14 | product | 768 | 29.82% | **FAIL** | `b5415489-dirty` |  |
| 2026-10-30 03:17 | product | 1440 | 20.52% | **FAIL** | `b5415489-dirty` |  |
| 2026-10-30 03:19 | category | 380 | n/a | REFUSED | `b5415489-dirty` | live side is our-build |
| 2026-10-30 03:19 | category | 768 | n/a | REFUSED | `b5415489-dirty` | live side is our-build |
| 2026-10-30 03:19 | category | 1440 | n/a | REFUSED | `b5415489-dirty` | live side is our-build |
| 2026-10-30 04:07 | home | 1440 | 27.62% | **FAIL** | `c2292c09-dirty` |  |
| 2026-10-30 04:09 | home | 380 | 39.85% | **FAIL** | `c2292c09-dirty` |  |
| 2026-10-30 04:11 | home | 768 | 36.52% | **FAIL** | `c2292c09-dirty` |  |
| 2026-10-30 04:13 | home | 1440 | 27.53% | **FAIL** | `c2292c09-dirty` |  |
| 2026-10-30 04:17 | product | 380 | 36.58% | **FAIL** | `c2292c09-dirty` |  |
| 2026-10-30 04:19 | product | 768 | 29.82% | **FAIL** | `c2292c09-dirty` |  |
| 2026-10-30 04:22 | product | 1440 | 20.52% | **FAIL** | `c2292c09-dirty` |  |
| 2026-10-30 04:25 | product | 380 | 36.58% | **FAIL** | `c2292c09-dirty` |  |
| 2026-10-30 04:28 | product | 768 | 29.82% | **FAIL** | `c2292c09-dirty` |  |
| 2026-10-30 04:31 | product | 1440 | 20.52% | **FAIL** | `c2292c09-dirty` |  |
| 2026-10-30 04:33 | category | 380 | n/a | REFUSED | `c2292c09-dirty` | live side is our-build |
| 2026-10-30 04:33 | category | 768 | n/a | REFUSED | `c2292c09-dirty` | live side is our-build |
| 2026-10-30 04:33 | category | 1440 | n/a | REFUSED | `c2292c09-dirty` | live side is our-build |
| 2026-10-30 04:55 | home | 380 | 39.85% | **FAIL** | `1afd2c9b-dirty` |  |
| 2026-10-30 04:57 | home | 768 | 36.52% | **FAIL** | `1afd2c9b-dirty` |  |
| 2026-10-30 04:59 | home | 1440 | 27.53% | **FAIL** | `1afd2c9b-dirty` |  |
| 2026-10-30 05:01 | home | 380 | 39.85% | **FAIL** | `1afd2c9b-dirty` |  |
| 2026-10-30 05:03 | home | 768 | 36.53% | **FAIL** | `1afd2c9b-dirty` |  |
| 2026-10-30 05:05 | home | 1440 | 27.53% | **FAIL** | `1afd2c9b-dirty` |  |
| 2026-10-30 05:08 | product | 380 | n/a | REFUSED | `6c0faf3a-dirty` | live side is our-build |
| 2026-10-30 05:08 | product | 768 | n/a | REFUSED | `6c0faf3a-dirty` | live side is our-build |
| 2026-10-30 05:08 | product | 1440 | n/a | REFUSED | `6c0faf3a-dirty` | live side is our-build |
| 2026-10-30 05:09 | product | 380 | 36.58% | **FAIL** | `6c0faf3a-dirty` |  |
| 2026-10-30 05:12 | product | 768 | 29.82% | **FAIL** | `6c0faf3a-dirty` |  |
| 2026-10-30 05:15 | product | 1440 | 20.52% | **FAIL** | `6c0faf3a-dirty` |  |
| 2026-10-30 05:17 | product | 380 | 36.58% | **FAIL** | `6c0faf3a-dirty` |  |
| 2026-10-30 05:20 | product | 768 | 29.82% | **FAIL** | `6c0faf3a-dirty` |  |
| 2026-10-30 05:22 | product | 1440 | 20.41% | **FAIL** | `6c0faf3a-dirty` |  |
| 2026-10-30 05:25 | category | 380 | n/a | REFUSED | `be8b48b8-dirty` | live side is our-build |
| 2026-10-30 05:25 | category | 768 | n/a | REFUSED | `be8b48b8-dirty` | live side is our-build |
| 2026-10-30 05:25 | category | 1440 | n/a | REFUSED | `be8b48b8-dirty` | live side is our-build |
| 2026-10-30 05:54 | home | 380 | 39.85% | **FAIL** | `f2e9b6b6-dirty` |  |
| 2026-10-30 05:56 | home | 768 | 36.53% | **FAIL** | `f2e9b6b6-dirty` |  |
| 2026-10-30 05:58 | home | 1440 | 27.53% | **FAIL** | `f2e9b6b6-dirty` |  |
| 2026-10-30 06:01 | home | 380 | 39.85% | **FAIL** | `f2e9b6b6-dirty` |  |
| 2026-10-30 06:03 | home | 768 | 36.53% | **FAIL** | `f2e9b6b6-dirty` |  |
| 2026-10-30 06:05 | home | 1440 | 27.52% | **FAIL** | `f2e9b6b6-dirty` |  |
| 2026-10-30 06:08 | product | 380 | n/a | REFUSED | `9cf07c32-dirty` | live side is our-build |
| 2026-10-30 06:08 | product | 768 | n/a | REFUSED | `9cf07c32-dirty` | live side is our-build |
| 2026-10-30 06:08 | product | 1440 | n/a | REFUSED | `9cf07c32-dirty` | live side is our-build |
| 2026-10-30 06:12 | category | 380 | n/a | REFUSED | `9cf07c32-dirty` | live side is our-build |
| 2026-10-30 06:12 | category | 768 | n/a | REFUSED | `9cf07c32-dirty` | live side is our-build |
| 2026-10-30 06:12 | category | 1440 | n/a | REFUSED | `9cf07c32-dirty` | live side is our-build |
| 2026-10-30 06:31 | home | 380 | 39.85% | **FAIL** | `e8ca5a06-dirty` |  |
| 2026-10-30 06:33 | home | 768 | 36.53% | **FAIL** | `e8ca5a06-dirty` |  |
| 2026-10-30 06:35 | home | 1440 | 27.53% | **FAIL** | `e8ca5a06-dirty` |  |
| 2026-10-30 06:37 | home | 380 | 39.83% | **FAIL** | `e8ca5a06-dirty` |  |
| 2026-10-30 06:39 | home | 768 | 36.52% | **FAIL** | `e8ca5a06-dirty` |  |
| 2026-10-30 06:41 | home | 1440 | 27.52% | **FAIL** | `e8ca5a06-dirty` |  |
| 2026-10-30 06:44 | product | 380 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 06:44 | product | 768 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 06:44 | product | 1440 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 06:44 | category | 380 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 06:45 | category | 768 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 06:45 | category | 1440 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 07:03 | home | 380 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 07:03 | home | 768 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 07:03 | home | 1440 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 07:06 | home | 380 | 39.85% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:08 | home | 768 | 36.53% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:10 | home | 1440 | 27.52% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:12 | home | 380 | 39.84% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:15 | home | 768 | 36.52% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:17 | home | 1440 | 27.52% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:19 | product | 380 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 07:19 | product | 768 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 07:19 | product | 1440 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 07:21 | product | 380 | 36.58% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:23 | product | 768 | 29.82% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:25 | product | 1440 | 20.52% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:28 | product | 380 | 36.58% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:30 | product | 768 | 29.82% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:33 | product | 1440 | 20.52% | **FAIL** | `f2cdf8ec-dirty` |  |
| 2026-10-30 07:35 | category | 380 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 07:35 | category | 768 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 07:35 | category | 1440 | n/a | REFUSED | `f2cdf8ec-dirty` | live side is our-build |
| 2026-10-30 07:54 | home | 380 | 39.83% | **FAIL** | `1b42c096-dirty` |  |
| 2026-10-30 07:56 | home | 768 | 36.52% | **FAIL** | `1b42c096-dirty` |  |
| 2026-10-30 07:58 | home | 1440 | 27.53% | **FAIL** | `1b42c096-dirty` |  |
| 2026-10-30 08:01 | home | 380 | 39.85% | **FAIL** | `1b42c096-dirty` |  |
| 2026-10-30 08:03 | home | 768 | 36.53% | **FAIL** | `1b42c096-dirty` |  |
| 2026-10-30 08:05 | home | 1440 | 27.53% | **FAIL** | `1b42c096-dirty` |  |
| 2026-10-30 08:08 | product | 380 | n/a | REFUSED | `616eea69-dirty` | live side is our-build |
| 2026-10-30 08:08 | product | 768 | n/a | REFUSED | `616eea69-dirty` | live side is our-build |
| 2026-10-30 08:08 | product | 1440 | n/a | REFUSED | `616eea69-dirty` | live side is our-build |
| 2026-10-30 08:10 | product | 380 | 36.58% | **FAIL** | `616eea69-dirty` |  |
| 2026-10-30 08:13 | product | 768 | 29.82% | **FAIL** | `616eea69-dirty` |  |
| 2026-10-30 08:15 | product | 1440 | 20.52% | **FAIL** | `616eea69-dirty` |  |
| 2026-10-30 08:17 | product | 380 | 36.58% | **FAIL** | `616eea69-dirty` |  |
| 2026-10-30 08:19 | product | 768 | 29.82% | **FAIL** | `616eea69-dirty` |  |
| 2026-10-30 08:21 | product | 1440 | 20.52% | **FAIL** | `616eea69-dirty` |  |
| 2026-10-30 08:23 | category | 380 | n/a | REFUSED | `616eea69-dirty` | live side is our-build |
| 2026-10-30 08:23 | category | 768 | n/a | REFUSED | `616eea69-dirty` | live side is our-build |
| 2026-10-30 08:23 | category | 1440 | n/a | REFUSED | `616eea69-dirty` | live side is our-build |
| 2026-10-30 08:46 | home | 380 | 39.85% | **FAIL** | `521822f3-dirty` |  |
| 2026-10-30 08:49 | home | 768 | 36.53% | **FAIL** | `521822f3-dirty` |  |
| 2026-10-30 08:51 | home | 1440 | 27.53% | **FAIL** | `521822f3-dirty` |  |
| 2026-10-30 08:53 | home | 380 | 39.85% | **FAIL** | `521822f3-dirty` |  |
| 2026-10-30 08:55 | home | 768 | 36.53% | **FAIL** | `521822f3-dirty` |  |
| 2026-10-30 08:57 | home | 1440 | 27.61% | **FAIL** | `521822f3-dirty` |  |
| 2026-10-30 08:59 | product | 380 | n/a | REFUSED | `ae4cc575-dirty` | live side is our-build |
| 2026-10-30 08:59 | product | 768 | n/a | REFUSED | `ae4cc575-dirty` | live side is our-build |
| 2026-10-30 08:59 | product | 1440 | n/a | REFUSED | `ae4cc575-dirty` | live side is our-build |
| 2026-10-30 09:02 | product | 380 | 36.58% | **FAIL** | `ae4cc575-dirty` |  |
| 2026-10-30 09:05 | product | 768 | 29.82% | **FAIL** | `ae4cc575-dirty` |  |
| 2026-10-30 09:07 | product | 1440 | 20.52% | **FAIL** | `ae4cc575-dirty` |  |
| 2026-10-30 09:10 | product | 380 | 36.58% | **FAIL** | `ae4cc575-dirty` |  |
| 2026-10-30 09:12 | product | 768 | 29.82% | **FAIL** | `ae4cc575-dirty` |  |
| 2026-10-30 09:15 | product | 1440 | 20.52% | **FAIL** | `ae4cc575-dirty` |  |
| 2026-10-30 09:17 | category | 380 | n/a | REFUSED | `ae4cc575-dirty` | live side is our-build |
| 2026-10-30 09:17 | category | 768 | n/a | REFUSED | `ae4cc575-dirty` | live side is our-build |
| 2026-10-30 09:17 | category | 1440 | n/a | REFUSED | `ae4cc575-dirty` | live side is our-build |
| 2026-10-30 09:41 | home | 380 | 39.85% | **FAIL** | `b86e4ee2-dirty` |  |
| 2026-10-30 09:43 | home | 768 | 36.52% | **FAIL** | `b86e4ee2-dirty` |  |
| 2026-10-30 09:45 | home | 1440 | 27.53% | **FAIL** | `b86e4ee2-dirty` |  |
| 2026-10-30 09:47 | home | 380 | 39.85% | **FAIL** | `b86e4ee2-dirty` |  |
| 2026-10-30 09:50 | home | 768 | 36.53% | **FAIL** | `b86e4ee2-dirty` |  |
| 2026-10-30 09:52 | home | 1440 | 27.62% | **FAIL** | `b86e4ee2-dirty` |  |
| 2026-10-30 09:55 | product | 380 | 36.58% | **FAIL** | `42995276-dirty` |  |
| 2026-10-30 09:57 | product | 768 | 29.62% | **FAIL** | `42995276-dirty` |  |
| 2026-10-30 09:59 | product | 1440 | 20.52% | **FAIL** | `42995276-dirty` |  |
| 2026-10-30 10:02 | product | 380 | 36.58% | **FAIL** | `42995276-dirty` |  |
| 2026-10-30 10:05 | product | 768 | 29.82% | **FAIL** | `42995276-dirty` |  |
| 2026-10-30 10:07 | product | 1440 | 20.52% | **FAIL** | `42995276-dirty` |  |
| 2026-10-30 10:09 | category | 380 | n/a | REFUSED | `bc67eb35-dirty` | live side is our-build |
| 2026-10-30 10:09 | category | 768 | n/a | REFUSED | `bc67eb35-dirty` | live side is our-build |
| 2026-10-30 10:10 | category | 1440 | n/a | REFUSED | `bc67eb35-dirty` | live side is our-build |
| 2026-10-30 11:59 | home | 380 | 39.83% | **FAIL** | `bc67eb35-dirty` |  |
| 2026-10-30 12:01 | home | 768 | 36.52% | **FAIL** | `bc67eb35-dirty` |  |
| 2026-10-30 12:03 | home | 1440 | 27.52% | **FAIL** | `bc67eb35-dirty` |  |
| 2026-10-30 12:05 | home | 380 | 39.84% | **FAIL** | `bc67eb35-dirty` |  |
| 2026-10-30 12:07 | home | 768 | 36.52% | **FAIL** | `bc67eb35-dirty` |  |
| 2026-10-30 12:09 | home | 1440 | 27.52% | **FAIL** | `bc67eb35-dirty` |  |
| 2026-10-30 12:11 | home | 380 | 39.84% | **FAIL** | `bc67eb35-dirty` |  |
| 2026-10-30 12:13 | home | 768 | 36.52% | **FAIL** | `bc67eb35-dirty` |  |
| 2026-10-30 12:15 | home | 1440 | 27.52% | **FAIL** | `bc67eb35-dirty` |  |
| 2026-10-30 12:32 | category | 380 | n/a | REFUSED | `e2f2ddef-dirty` | live side is our-build |
| 2026-10-30 12:32 | category | 768 | n/a | REFUSED | `e2f2ddef-dirty` | live side is our-build |
| 2026-10-30 12:32 | category | 1440 | n/a | REFUSED | `e2f2ddef-dirty` | live side is our-build |
| 2026-10-30 13:12 | home | 380 | 39.84% | **FAIL** | `22f5890b-dirty` |  |
| 2026-10-30 13:14 | home | 768 | 36.53% | **FAIL** | `22f5890b-dirty` |  |
| 2026-10-30 13:16 | home | 1440 | 27.53% | **FAIL** | `22f5890b-dirty` |  |
| 2026-10-30 13:19 | home | 380 | 39.85% | **FAIL** | `22f5890b-dirty` |  |
| 2026-10-30 13:21 | home | 768 | 36.53% | **FAIL** | `22f5890b-dirty` |  |
| 2026-10-30 13:23 | home | 1440 | 27.53% | **FAIL** | `22f5890b-dirty` |  |
| 2026-10-30 13:29 | product | 380 | 36.17% | **FAIL** | `22f5890b-dirty` |  |
| 2026-10-30 13:31 | product | 768 | 29.82% | **FAIL** | `22f5890b-dirty` |  |
| 2026-10-30 13:34 | product | 1440 | 20.52% | **FAIL** | `22f5890b-dirty` |  |
| 2026-10-30 13:36 | category | 380 | n/a | REFUSED | `3dcbe4f1-dirty` | live side is our-build |
| 2026-10-30 13:36 | category | 768 | n/a | REFUSED | `3dcbe4f1-dirty` | live side is our-build |
| 2026-10-30 13:36 | category | 1440 | n/a | REFUSED | `3dcbe4f1-dirty` | live side is our-build |
| 2026-10-30 13:59 | home | 380 | 39.85% | **FAIL** | `3dcbe4f1-dirty` |  |
| 2026-10-30 14:01 | home | 768 | 36.53% | **FAIL** | `3dcbe4f1-dirty` |  |
| 2026-10-30 14:04 | home | 1440 | 27.53% | **FAIL** | `3dcbe4f1-dirty` |  |
| 2026-10-30 14:06 | home | 380 | 39.85% | **FAIL** | `3dcbe4f1-dirty` |  |
| 2026-10-30 14:08 | home | 768 | 36.53% | **FAIL** | `3dcbe4f1-dirty` |  |
| 2026-10-30 14:10 | home | 1440 | 27.53% | **FAIL** | `3dcbe4f1-dirty` |  |
| 2026-10-30 14:12 | product | 380 | n/a | REFUSED | `7f10c6e1-dirty` | live side is our-build |
| 2026-10-30 14:12 | product | 768 | n/a | REFUSED | `7f10c6e1-dirty` | live side is our-build |
| 2026-10-30 14:12 | product | 1440 | n/a | REFUSED | `7f10c6e1-dirty` | live side is our-build |
| 2026-10-30 14:14 | product | 380 | 36.17% | **FAIL** | `7f10c6e1-dirty` |  |
| 2026-10-30 14:17 | product | 768 | 29.82% | **FAIL** | `7f10c6e1-dirty` |  |
| 2026-10-30 14:20 | product | 1440 | 20.52% | **FAIL** | `7f10c6e1-dirty` |  |
| 2026-10-30 14:23 | product | 380 | 36.58% | **FAIL** | `7f10c6e1-dirty` |  |
| 2026-10-30 14:25 | product | 768 | 29.82% | **FAIL** | `7f10c6e1-dirty` |  |
| 2026-10-30 14:28 | product | 1440 | 20.52% | **FAIL** | `7f10c6e1-dirty` |  |
| 2026-10-30 14:30 | category | 380 | n/a | REFUSED | `7f10c6e1-dirty` | live side is our-build |
| 2026-10-30 14:31 | category | 768 | n/a | REFUSED | `7f10c6e1-dirty` | live side is our-build |
| 2026-10-30 14:31 | category | 1440 | n/a | REFUSED | `7f10c6e1-dirty` | live side is our-build |
| 2026-10-30 14:55 | home | 380 | 39.85% | **FAIL** | `7eb7c983-dirty` |  |
| 2026-10-30 14:57 | home | 768 | 36.53% | **FAIL** | `7eb7c983-dirty` |  |
| 2026-10-30 14:59 | home | 1440 | 27.53% | **FAIL** | `7eb7c983-dirty` |  |
| 2026-10-30 15:01 | home | 380 | 39.85% | **FAIL** | `7eb7c983-dirty` |  |
| 2026-10-30 15:03 | home | 768 | 36.53% | **FAIL** | `7eb7c983-dirty` |  |
| 2026-10-30 15:05 | home | 1440 | 27.53% | **FAIL** | `7eb7c983-dirty` |  |
| 2026-10-30 15:08 | product | 380 | n/a | REFUSED | `122a1fc2-dirty` | live side is our-build |
| 2026-10-30 15:08 | product | 768 | n/a | REFUSED | `122a1fc2-dirty` | live side is our-build |
| 2026-10-30 15:08 | product | 1440 | n/a | REFUSED | `122a1fc2-dirty` | live side is our-build |
| 2026-10-30 15:09 | category | 380 | n/a | REFUSED | `122a1fc2-dirty` | live side is our-build |
| 2026-10-30 15:09 | category | 768 | n/a | REFUSED | `122a1fc2-dirty` | live side is our-build |
| 2026-10-30 15:09 | category | 1440 | n/a | REFUSED | `122a1fc2-dirty` | live side is our-build |
| 2026-10-30 15:29 | home | 380 | 39.85% | **FAIL** | `c8ac6172-dirty` |  |
| 2026-10-30 15:31 | home | 768 | 36.53% | **FAIL** | `c8ac6172-dirty` |  |
| 2026-10-30 15:33 | home | 1440 | 27.53% | **FAIL** | `c8ac6172-dirty` |  |
| 2026-10-30 15:35 | home | 380 | 39.85% | **FAIL** | `c8ac6172-dirty` |  |
| 2026-10-30 15:37 | home | 768 | 36.53% | **FAIL** | `c8ac6172-dirty` |  |
| 2026-10-30 15:39 | home | 1440 | 27.53% | **FAIL** | `c8ac6172-dirty` |  |
| 2026-10-30 15:45 | product | 380 | 36.58% | **FAIL** | `34476cb0-dirty` |  |
| 2026-10-30 15:47 | product | 768 | 29.82% | **FAIL** | `34476cb0-dirty` |  |
| 2026-10-30 15:49 | product | 1440 | 20.52% | **FAIL** | `34476cb0-dirty` |  |
| 2026-10-30 15:51 | product | 380 | 36.58% | **FAIL** | `34476cb0-dirty` |  |
| 2026-10-30 15:53 | product | 768 | 29.82% | **FAIL** | `34476cb0-dirty` |  |
| 2026-10-30 15:55 | product | 1440 | 20.52% | **FAIL** | `34476cb0-dirty` |  |
| 2026-10-30 15:57 | category | 380 | n/a | REFUSED | `79a2871c-dirty` | live side is our-build |
| 2026-10-30 15:57 | category | 768 | n/a | REFUSED | `79a2871c-dirty` | live side is our-build |
| 2026-10-30 15:57 | category | 1440 | n/a | REFUSED | `79a2871c-dirty` | live side is our-build |
| 2026-10-30 16:19 | home | 380 | 39.85% | **FAIL** | `79a2871c-dirty` |  |
| 2026-10-30 16:21 | home | 768 | 36.53% | **FAIL** | `79a2871c-dirty` |  |
| 2026-10-30 16:23 | home | 1440 | 27.53% | **FAIL** | `79a2871c-dirty` |  |
| 2026-10-30 16:25 | home | 380 | 39.82% | **FAIL** | `79a2871c-dirty` |  |
| 2026-10-30 16:27 | home | 768 | 36.52% | **FAIL** | `79a2871c-dirty` |  |
| 2026-10-30 16:30 | home | 1440 | 27.52% | **FAIL** | `79a2871c-dirty` |  |
| 2026-10-30 16:32 | home | 380 | 39.85% | **FAIL** | `79a2871c-dirty` |  |
| 2026-10-30 16:34 | home | 768 | 36.53% | **FAIL** | `79a2871c-dirty` |  |
| 2026-10-30 16:36 | home | 1440 | 27.53% | **FAIL** | `79a2871c-dirty` |  |
| 2026-10-30 16:38 | product | 380 | n/a | REFUSED | `e548f3c8-dirty` | live side is our-build |
| 2026-10-30 16:38 | product | 768 | n/a | REFUSED | `e548f3c8-dirty` | live side is our-build |
| 2026-10-30 16:39 | product | 1440 | n/a | REFUSED | `e548f3c8-dirty` | live side is our-build |
| 2026-10-30 16:42 | product | 380 | 36.17% | **FAIL** | `e548f3c8-dirty` |  |
| 2026-10-30 16:44 | product | 768 | 29.82% | **FAIL** | `e548f3c8-dirty` |  |
| 2026-10-30 16:47 | product | 1440 | 20.52% | **FAIL** | `e548f3c8-dirty` |  |
| 2026-10-30 16:50 | product | 380 | 36.17% | **FAIL** | `e548f3c8-dirty` |  |
| 2026-10-30 16:52 | product | 768 | 29.82% | **FAIL** | `e548f3c8-dirty` |  |
| 2026-10-30 16:55 | product | 1440 | 20.52% | **FAIL** | `e548f3c8-dirty` |  |
| 2026-10-30 16:57 | category | 380 | n/a | REFUSED | `e548f3c8-dirty` | live side is our-build |
| 2026-10-30 16:57 | category | 768 | n/a | REFUSED | `e548f3c8-dirty` | live side is our-build |
| 2026-10-30 16:57 | category | 1440 | n/a | REFUSED | `e548f3c8-dirty` | live side is our-build |
| 2026-10-30 17:19 | home | 1440 | n/a | REFUSED | `b7bc880a-dirty` | live side is our-build |
| 2026-10-30 17:20 | home | 380 | 39.83% | **FAIL** | `b7bc880a-dirty` |  |
| 2026-10-30 17:22 | home | 768 | 36.52% | **FAIL** | `b7bc880a-dirty` |  |
| 2026-10-30 17:24 | home | 1440 | 27.52% | **FAIL** | `b7bc880a-dirty` |  |
| 2026-10-30 17:26 | home | 380 | 39.84% | **FAIL** | `b7bc880a-dirty` |  |
| 2026-10-30 17:28 | home | 768 | 36.52% | **FAIL** | `b7bc880a-dirty` |  |
| 2026-10-30 17:30 | home | 1440 | 27.52% | **FAIL** | `b7bc880a-dirty` |  |
| 2026-10-30 17:33 | product | 380 | n/a | REFUSED | `9f733ca7-dirty` | live side is our-build |
| 2026-10-30 17:33 | product | 768 | n/a | REFUSED | `9f733ca7-dirty` | live side is our-build |
| 2026-10-30 17:33 | product | 1440 | n/a | REFUSED | `9f733ca7-dirty` | live side is our-build |
| 2026-10-30 17:34 | category | 380 | n/a | REFUSED | `9f733ca7-dirty` | live side is our-build |
| 2026-10-30 17:34 | category | 768 | n/a | REFUSED | `9f733ca7-dirty` | live side is our-build |
| 2026-10-30 17:34 | category | 1440 | n/a | REFUSED | `9f733ca7-dirty` | live side is our-build |
| 2026-10-30 18:10 | product | 380 | n/a | REFUSED | `49d85b9a-dirty` | live side is unknown |
| 2026-10-30 18:10 | product | 768 | n/a | REFUSED | `49d85b9a-dirty` | live side is unknown |
| 2026-10-30 18:10 | product | 1440 | n/a | REFUSED | `49d85b9a-dirty` | live side is unknown |
| 2026-10-30 18:11 | category | 380 | n/a | REFUSED | `49d85b9a-dirty` | live side is unknown |
| 2026-10-30 18:11 | category | 768 | n/a | REFUSED | `49d85b9a-dirty` | live side is unknown |
| 2026-10-30 18:11 | category | 1440 | n/a | REFUSED | `49d85b9a-dirty` | live side is unknown |
| 2026-10-30 18:38 | home | 380 | 39.83% | **FAIL** | `5e216b47-dirty` |  |
| 2026-10-30 18:40 | home | 768 | 36.52% | **FAIL** | `5e216b47-dirty` |  |
| 2026-10-30 18:42 | home | 1440 | 27.53% | **FAIL** | `5e216b47-dirty` |  |
| 2026-10-30 18:44 | home | 380 | 39.84% | **FAIL** | `5e216b47-dirty` |  |
| 2026-10-30 18:47 | home | 768 | 36.52% | **FAIL** | `5e216b47-dirty` |  |
| 2026-10-30 18:49 | home | 1440 | 27.53% | **FAIL** | `5e216b47-dirty` |  |
| 2026-10-30 18:51 | product | 380 | n/a | REFUSED | `5e216b47-dirty` | live side is our-build |
| 2026-10-30 18:51 | product | 768 | n/a | REFUSED | `5e216b47-dirty` | live side is our-build |
| 2026-10-30 18:51 | product | 1440 | n/a | REFUSED | `5e216b47-dirty` | live side is our-build |
| 2026-10-30 18:54 | product | 380 | 36.58% | **FAIL** | `5e216b47-dirty` |  |
| 2026-10-30 18:56 | product | 768 | 29.82% | **FAIL** | `5e216b47-dirty` |  |
| 2026-10-30 18:59 | product | 1440 | 20.52% | **FAIL** | `5e216b47-dirty` |  |
| 2026-10-30 19:02 | category | 380 | n/a | REFUSED | `5e216b47-dirty` | live side is our-build |
| 2026-10-30 19:02 | category | 768 | n/a | REFUSED | `5e216b47-dirty` | live side is our-build |
| 2026-10-30 19:02 | category | 1440 | n/a | REFUSED | `5e216b47-dirty` | live side is our-build |
| 2026-10-30 19:22 | home | 380 | 39.82% | **FAIL** | `15a757f3-dirty` |  |
| 2026-10-30 19:24 | home | 768 | 36.52% | **FAIL** | `15a757f3-dirty` |  |
| 2026-10-30 19:26 | home | 1440 | 27.53% | **FAIL** | `15a757f3-dirty` |  |
| 2026-10-30 19:29 | home | 380 | 39.83% | **FAIL** | `15a757f3-dirty` |  |
| 2026-10-30 19:31 | home | 768 | 36.52% | **FAIL** | `15a757f3-dirty` |  |
| 2026-10-30 19:33 | home | 1440 | 27.53% | **FAIL** | `15a757f3-dirty` |  |
| 2026-10-30 19:36 | product | 380 | n/a | REFUSED | `b7abd040-dirty` | live side is our-build |
| 2026-10-30 19:36 | product | 768 | n/a | REFUSED | `b7abd040-dirty` | live side is our-build |
| 2026-10-30 19:36 | product | 1440 | n/a | REFUSED | `b7abd040-dirty` | live side is our-build |
| 2026-10-30 19:37 | category | 380 | n/a | REFUSED | `b7abd040-dirty` | live side is our-build |
| 2026-10-30 19:37 | category | 768 | n/a | REFUSED | `b7abd040-dirty` | live side is our-build |
| 2026-10-30 19:37 | category | 1440 | n/a | REFUSED | `b7abd040-dirty` | live side is our-build |
| 2026-10-30 20:04 | home | 380 | 39.83% | **FAIL** | `8ea289a8-dirty` |  |
| 2026-10-30 20:07 | home | 768 | 36.52% | **FAIL** | `8ea289a8-dirty` |  |
| 2026-10-30 20:09 | home | 1440 | 27.52% | **FAIL** | `8ea289a8-dirty` |  |
| 2026-10-30 20:11 | home | 380 | 39.84% | **FAIL** | `8ea289a8-dirty` |  |
| 2026-10-30 20:13 | home | 768 | 36.53% | **FAIL** | `8ea289a8-dirty` |  |
| 2026-10-30 20:15 | home | 1440 | 27.53% | **FAIL** | `8ea289a8-dirty` |  |
| 2026-10-30 20:22 | product | 380 | 36.17% | **FAIL** | `f891e6c3-dirty` |  |
| 2026-10-30 20:25 | product | 768 | 29.82% | **FAIL** | `f891e6c3-dirty` |  |
| 2026-10-30 20:27 | product | 1440 | 20.52% | **FAIL** | `f891e6c3-dirty` |  |
| 2026-10-30 20:30 | product | 380 | 36.58% | **FAIL** | `f891e6c3-dirty` |  |
| 2026-10-30 20:33 | product | 768 | 29.82% | **FAIL** | `f891e6c3-dirty` |  |
| 2026-10-30 20:35 | product | 1440 | 20.52% | **FAIL** | `f891e6c3-dirty` |  |
| 2026-10-30 20:37 | category | 380 | n/a | REFUSED | `f891e6c3-dirty` | live side is our-build |
| 2026-10-30 20:37 | category | 768 | n/a | REFUSED | `f891e6c3-dirty` | live side is our-build |
| 2026-10-30 20:37 | category | 1440 | n/a | REFUSED | `f891e6c3-dirty` | live side is our-build |
| 2026-10-30 21:09 | home | 1440 | n/a | REFUSED | `02ae51cc-dirty` | live side is our-build |
| 2026-10-30 21:10 | home | 380 | 39.83% | **FAIL** | `02ae51cc-dirty` |  |
| 2026-10-30 21:12 | home | 768 | 36.52% | **FAIL** | `02ae51cc-dirty` |  |
| 2026-10-30 21:14 | home | 1440 | 27.52% | **FAIL** | `02ae51cc-dirty` |  |
| 2026-10-30 21:17 | home | 380 | 39.85% | **FAIL** | `02ae51cc-dirty` |  |
| 2026-10-30 21:19 | home | 768 | 36.52% | **FAIL** | `02ae51cc-dirty` |  |
| 2026-10-30 21:21 | home | 1440 | 27.53% | **FAIL** | `02ae51cc-dirty` |  |
| 2026-10-30 21:34 | category | 380 | n/a | REFUSED | `7f80ad2e-dirty` | live side is our-build |
| 2026-10-30 21:34 | category | 768 | n/a | REFUSED | `7f80ad2e-dirty` | live side is our-build |
| 2026-10-30 21:34 | category | 1440 | n/a | REFUSED | `7f80ad2e-dirty` | live side is our-build |
| 2026-10-30 21:56 | home | 380 | n/a | REFUSED | `020225d3-dirty` | live side is our-build |
| 2026-10-30 21:56 | home | 768 | n/a | REFUSED | `020225d3-dirty` | live side is our-build |
| 2026-10-30 21:56 | home | 1440 | n/a | REFUSED | `020225d3-dirty` | live side is our-build |
| 2026-10-30 21:57 | home | 380 | 39.85% | **FAIL** | `020225d3-dirty` |  |
| 2026-10-30 21:59 | home | 768 | 36.53% | **FAIL** | `020225d3-dirty` |  |
| 2026-10-30 22:04 | home | 1440 | 27.62% | **FAIL** | `020225d3-dirty` |  |
| 2026-10-30 22:07 | home | 380 | 39.83% | **FAIL** | `020225d3-dirty` |  |
| 2026-10-30 22:09 | home | 768 | 36.52% | **FAIL** | `020225d3-dirty` |  |
| 2026-10-30 22:11 | home | 1440 | 27.52% | **FAIL** | `020225d3-dirty` |  |
| 2026-10-30 22:19 | product | 380 | 36.58% | **FAIL** | `020225d3-dirty` |  |
| 2026-10-30 22:22 | product | 768 | 29.82% | **FAIL** | `020225d3-dirty` |  |
| 2026-10-30 22:24 | product | 1440 | 20.52% | **FAIL** | `020225d3-dirty` |  |
| 2026-10-30 22:27 | category | 380 | n/a | REFUSED | `11f0e884-dirty` | live side is our-build |
| 2026-10-30 22:27 | category | 768 | n/a | REFUSED | `11f0e884-dirty` | live side is our-build |
| 2026-10-30 22:27 | category | 1440 | n/a | REFUSED | `11f0e884-dirty` | live side is our-build |
| 2026-10-30 22:46 | home | 380 | n/a | REFUSED | `11f0e884-dirty` | live side is our-build |
| 2026-10-30 22:46 | home | 768 | n/a | REFUSED | `11f0e884-dirty` | live side is our-build |
| 2026-10-30 22:47 | home | 1440 | n/a | REFUSED | `11f0e884-dirty` | live side is our-build |
| 2026-10-30 22:50 | home | 380 | 39.83% | **FAIL** | `11f0e884-dirty` |  |
| 2026-10-30 22:52 | home | 768 | 36.59% | **FAIL** | `11f0e884-dirty` |  |
| 2026-10-30 22:54 | home | 1440 | 27.52% | **FAIL** | `11f0e884-dirty` |  |
| 2026-10-30 22:57 | product | 380 | n/a | REFUSED | `11f0e884-dirty` | live side is our-build |
| 2026-10-30 22:57 | product | 768 | n/a | REFUSED | `11f0e884-dirty` | live side is our-build |
| 2026-10-30 22:57 | product | 1440 | n/a | REFUSED | `11f0e884-dirty` | live side is our-build |
| 2026-10-30 23:02 | product | 380 | 36.58% | **FAIL** | `11f0e884-dirty` |  |
| 2026-10-30 23:05 | product | 768 | 29.82% | **FAIL** | `11f0e884-dirty` |  |
| 2026-10-30 23:08 | product | 1440 | 20.52% | **FAIL** | `11f0e884-dirty` |  |
| 2026-10-30 23:11 | product | 380 | 36.58% | **FAIL** | `11f0e884-dirty` |  |
| 2026-10-30 23:13 | product | 768 | 29.82% | **FAIL** | `11f0e884-dirty` |  |
| 2026-10-30 23:16 | product | 1440 | 20.51% | **FAIL** | `11f0e884-dirty` |  |
| 2026-10-30 23:51 | home | 380 | 39.84% | **FAIL** | `f41f59c1-dirty` |  |
| 2026-10-30 23:53 | home | 768 | 36.53% | **FAIL** | `f41f59c1-dirty` |  |
| 2026-10-30 23:55 | home | 1440 | 27.53% | **FAIL** | `f41f59c1-dirty` |  |
| 2026-10-30 23:57 | home | 380 | 39.85% | **FAIL** | `f41f59c1-dirty` |  |
| 2026-10-30 23:59 | home | 768 | 36.53% | **FAIL** | `f41f59c1-dirty` |  |
| 2026-10-31 00:01 | home | 1440 | 27.53% | **FAIL** | `f41f59c1-dirty` |  |
| 2026-10-31 00:04 | product | 380 | 36.17% | **FAIL** | `094ad997-dirty` |  |
| 2026-10-31 00:06 | product | 768 | 29.82% | **FAIL** | `094ad997-dirty` |  |
| 2026-10-31 00:09 | product | 1440 | 20.52% | **FAIL** | `094ad997-dirty` |  |
| 2026-10-31 00:12 | product | 380 | 36.17% | **FAIL** | `094ad997-dirty` |  |
| 2026-10-31 00:14 | product | 768 | 29.82% | **FAIL** | `094ad997-dirty` |  |
| 2026-10-31 00:17 | product | 1440 | 20.52% | **FAIL** | `094ad997-dirty` |  |
| 2026-10-31 00:19 | category | 380 | n/a | REFUSED | `de2274e3-dirty` | live side is our-build |
| 2026-10-31 00:19 | category | 768 | n/a | REFUSED | `de2274e3-dirty` | live side is our-build |
| 2026-10-31 00:19 | category | 1440 | n/a | REFUSED | `de2274e3-dirty` | live side is our-build |
| 2026-10-31 00:40 | home | 380 | 39.85% | **FAIL** | `46811d06-dirty` |  |
| 2026-10-31 00:42 | home | 768 | 36.53% | **FAIL** | `46811d06-dirty` |  |
| 2026-10-31 00:44 | home | 1440 | 27.53% | **FAIL** | `46811d06-dirty` |  |
| 2026-10-31 00:46 | home | 380 | 39.83% | **FAIL** | `46811d06-dirty` |  |
| 2026-10-31 00:49 | home | 768 | 36.52% | **FAIL** | `46811d06-dirty` |  |
| 2026-10-31 00:51 | home | 1440 | 27.52% | **FAIL** | `46811d06-dirty` |  |
| 2026-10-31 00:53 | product | 380 | n/a | REFUSED | `ea53e8ee-dirty` | live side is our-build |
| 2026-10-31 00:53 | product | 768 | n/a | REFUSED | `ea53e8ee-dirty` | live side is our-build |
| 2026-10-31 00:53 | product | 1440 | n/a | REFUSED | `ea53e8ee-dirty` | live side is our-build |
| 2026-10-31 00:58 | product | 380 | 36.58% | **FAIL** | `ea53e8ee-dirty` |  |
| 2026-10-31 01:01 | product | 768 | 29.82% | **FAIL** | `ea53e8ee-dirty` |  |
| 2026-10-31 01:04 | product | 1440 | 20.52% | **FAIL** | `ea53e8ee-dirty` |  |
| 2026-10-31 01:06 | category | 380 | n/a | REFUSED | `ea53e8ee-dirty` | live side is our-build |
| 2026-10-31 01:06 | category | 768 | n/a | REFUSED | `ea53e8ee-dirty` | live side is our-build |
| 2026-10-31 01:06 | category | 1440 | n/a | REFUSED | `ea53e8ee-dirty` | live side is our-build |
| 2026-10-31 01:26 | home | 380 | 39.84% | **FAIL** | `3951d2f2-dirty` |  |
| 2026-10-31 01:28 | home | 768 | 36.52% | **FAIL** | `3951d2f2-dirty` |  |
| 2026-10-31 01:30 | home | 1440 | 27.52% | **FAIL** | `3951d2f2-dirty` |  |
| 2026-10-31 01:32 | home | 380 | 39.84% | **FAIL** | `3951d2f2-dirty` |  |
| 2026-10-31 01:34 | home | 768 | 36.53% | **FAIL** | `3951d2f2-dirty` |  |
| 2026-10-31 01:36 | home | 1440 | 27.52% | **FAIL** | `3951d2f2-dirty` |  |
| 2026-10-31 01:39 | product | 380 | n/a | REFUSED | `271882fc-dirty` | live side is our-build |
| 2026-10-31 01:39 | product | 768 | n/a | REFUSED | `271882fc-dirty` | live side is our-build |
| 2026-10-31 01:39 | product | 1440 | n/a | REFUSED | `271882fc-dirty` | live side is our-build |
| 2026-10-31 01:41 | product | 380 | 36.58% | **FAIL** | `271882fc-dirty` |  |
| 2026-10-31 01:43 | product | 768 | 29.82% | **FAIL** | `271882fc-dirty` |  |
| 2026-10-31 01:46 | product | 1440 | 20.52% | **FAIL** | `271882fc-dirty` |  |
| 2026-10-31 01:48 | category | 380 | n/a | REFUSED | `271882fc-dirty` | live side is our-build |
| 2026-10-31 01:48 | category | 768 | n/a | REFUSED | `271882fc-dirty` | live side is our-build |
| 2026-10-31 01:48 | category | 1440 | n/a | REFUSED | `271882fc-dirty` | live side is our-build |
| 2026-10-31 02:07 | home | 380 | 39.85% | **FAIL** | `d61115b2-dirty` |  |
| 2026-10-31 02:09 | home | 768 | 36.52% | **FAIL** | `d61115b2-dirty` |  |
| 2026-10-31 02:11 | home | 1440 | 27.52% | **FAIL** | `d61115b2-dirty` |  |
| 2026-10-31 02:13 | home | 380 | 39.84% | **FAIL** | `d61115b2-dirty` |  |
| 2026-10-31 02:15 | home | 768 | 36.52% | **FAIL** | `d61115b2-dirty` |  |
| 2026-10-31 02:17 | home | 1440 | 27.52% | **FAIL** | `d61115b2-dirty` |  |
| 2026-10-31 02:20 | product | 380 | n/a | REFUSED | `4bc61e82-dirty` | live side is our-build |
| 2026-10-31 02:20 | product | 768 | n/a | REFUSED | `4bc61e82-dirty` | live side is our-build |
| 2026-10-31 02:20 | product | 1440 | n/a | REFUSED | `4bc61e82-dirty` | live side is our-build |
| 2026-10-31 02:21 | category | 380 | n/a | REFUSED | `4bc61e82-dirty` | live side is our-build |
| 2026-10-31 02:21 | category | 768 | n/a | REFUSED | `4bc61e82-dirty` | live side is our-build |
| 2026-10-31 02:21 | category | 1440 | n/a | REFUSED | `4bc61e82-dirty` | live side is our-build |
| 2026-10-31 02:48 | home | 1440 | n/a | REFUSED | `8eddab69-dirty` | live side is our-build |
| 2026-10-31 02:49 | home | 380 | 39.83% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 02:51 | home | 768 | 36.52% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 02:53 | home | 1440 | 27.52% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 02:55 | home | 380 | 39.85% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 02:58 | home | 768 | 36.53% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 03:00 | home | 1440 | 27.53% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 03:02 | product | 380 | n/a | REFUSED | `8eddab69-dirty` | live side is our-build |
| 2026-10-31 03:02 | product | 768 | n/a | REFUSED | `8eddab69-dirty` | live side is our-build |
| 2026-10-31 03:02 | product | 1440 | n/a | REFUSED | `8eddab69-dirty` | live side is our-build |
| 2026-10-31 03:05 | product | 380 | 36.14% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 03:08 | product | 768 | 29.82% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 03:11 | product | 1440 | 20.52% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 03:13 | product | 380 | 36.58% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 03:15 | product | 768 | 29.82% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 03:18 | product | 1440 | 20.52% | **FAIL** | `8eddab69-dirty` |  |
| 2026-10-31 03:20 | category | 380 | n/a | REFUSED | `8eddab69-dirty` | live side is our-build |
| 2026-10-31 03:20 | category | 768 | n/a | REFUSED | `8eddab69-dirty` | live side is our-build |
| 2026-10-31 03:20 | category | 1440 | n/a | REFUSED | `8eddab69-dirty` | live side is our-build |
| 2026-10-31 03:42 | home | 380 | n/a | REFUSED | `297dd2d4-dirty` | live side is our-build |
| 2026-10-31 03:42 | home | 768 | n/a | REFUSED | `297dd2d4-dirty` | live side is our-build |
| 2026-10-31 03:42 | home | 1440 | n/a | REFUSED | `297dd2d4-dirty` | live side is our-build |
| 2026-10-31 03:43 | home | 380 | 39.83% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 03:45 | home | 768 | 36.52% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 03:47 | home | 1440 | 27.52% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 03:50 | home | 380 | 39.83% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 03:52 | home | 768 | 36.52% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 03:54 | home | 1440 | 27.53% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 03:57 | product | 380 | 36.17% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 03:59 | product | 768 | 29.82% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 04:02 | product | 1440 | 20.52% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 04:04 | product | 380 | 36.17% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 04:06 | product | 768 | 29.82% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 04:09 | product | 1440 | 20.52% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 04:11 | category | 380 | n/a | REFUSED | `297dd2d4-dirty` | live side is our-build |
| 2026-10-31 04:12 | category | 768 | n/a | REFUSED | `297dd2d4-dirty` | live side is our-build |
| 2026-10-31 04:12 | category | 1440 | n/a | REFUSED | `297dd2d4-dirty` | live side is our-build |
| 2026-10-31 04:30 | home | 380 | 39.83% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 04:32 | home | 768 | 36.52% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 04:34 | home | 1440 | 27.52% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 04:36 | home | 380 | 39.83% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 04:38 | home | 768 | 36.52% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 04:40 | home | 1440 | 27.52% | **FAIL** | `297dd2d4-dirty` |  |
| 2026-10-31 04:43 | product | 380 | n/a | REFUSED | `17d054ef-dirty` | live side is our-build |
| 2026-10-31 04:43 | product | 768 | n/a | REFUSED | `17d054ef-dirty` | live side is our-build |
| 2026-10-31 04:43 | product | 1440 | n/a | REFUSED | `17d054ef-dirty` | live side is our-build |
| 2026-10-31 04:44 | product | 380 | 36.17% | **FAIL** | `17d054ef-dirty` |  |
| 2026-10-31 04:47 | product | 768 | 29.82% | **FAIL** | `17d054ef-dirty` |  |
| 2026-10-31 04:50 | product | 1440 | 20.52% | **FAIL** | `17d054ef-dirty` |  |
| 2026-10-31 04:52 | category | 380 | n/a | REFUSED | `2c76ae85-dirty` | live side is our-build |
| 2026-10-31 04:52 | category | 768 | n/a | REFUSED | `2c76ae85-dirty` | live side is our-build |
| 2026-10-31 04:52 | category | 1440 | n/a | REFUSED | `2c76ae85-dirty` | live side is our-build |
| 2026-10-31 05:15 | home | 380 | n/a | REFUSED | `e6fb8379-dirty` | live side is our-build |
| 2026-10-31 05:16 | home | 768 | n/a | REFUSED | `e6fb8379-dirty` | live side is our-build |
| 2026-10-31 05:16 | home | 1440 | n/a | REFUSED | `e6fb8379-dirty` | live side is our-build |
| 2026-10-31 05:19 | home | 380 | 39.84% | **FAIL** | `e6fb8379-dirty` |  |
| 2026-10-31 05:21 | home | 768 | 36.52% | **FAIL** | `e6fb8379-dirty` |  |
| 2026-10-31 05:23 | home | 1440 | 27.52% | **FAIL** | `e6fb8379-dirty` |  |
| 2026-10-31 05:26 | home | 380 | 39.84% | **FAIL** | `e6fb8379-dirty` |  |
| 2026-10-31 05:28 | home | 768 | 36.52% | **FAIL** | `e6fb8379-dirty` |  |
| 2026-10-31 05:30 | home | 1440 | 27.52% | **FAIL** | `e6fb8379-dirty` |  |
| 2026-10-31 05:33 | product | 380 | n/a | REFUSED | `67756d39-dirty` | live side is our-build |
| 2026-10-31 05:33 | product | 768 | n/a | REFUSED | `67756d39-dirty` | live side is our-build |
| 2026-10-31 05:33 | product | 1440 | n/a | REFUSED | `67756d39-dirty` | live side is our-build |
| 2026-10-31 05:38 | product | 380 | 36.58% | **FAIL** | `67756d39-dirty` |  |
| 2026-10-31 05:41 | product | 768 | 29.82% | **FAIL** | `67756d39-dirty` |  |
| 2026-10-31 05:44 | product | 1440 | 20.52% | **FAIL** | `67756d39-dirty` |  |
| 2026-10-31 05:47 | product | 380 | 36.58% | **FAIL** | `67756d39-dirty` |  |
| 2026-10-31 05:49 | product | 768 | 29.82% | **FAIL** | `67756d39-dirty` |  |
| 2026-10-31 05:51 | product | 1440 | 20.52% | **FAIL** | `67756d39-dirty` |  |
| 2026-10-31 05:54 | category | 380 | n/a | REFUSED | `67756d39-dirty` | live side is our-build |
| 2026-10-31 05:54 | category | 768 | n/a | REFUSED | `67756d39-dirty` | live side is our-build |
| 2026-10-31 05:54 | category | 1440 | n/a | REFUSED | `67756d39-dirty` | live side is our-build |
| 2026-10-31 06:17 | home | 380 | 39.83% | **FAIL** | `ce6723c2-dirty` |  |
| 2026-10-31 06:19 | home | 768 | 36.52% | **FAIL** | `ce6723c2-dirty` |  |
| 2026-10-31 06:21 | home | 1440 | 27.52% | **FAIL** | `ce6723c2-dirty` |  |
| 2026-10-31 06:23 | home | 380 | 39.85% | **FAIL** | `ce6723c2-dirty` |  |
| 2026-10-31 06:25 | home | 768 | 36.53% | **FAIL** | `ce6723c2-dirty` |  |
| 2026-10-31 06:27 | home | 1440 | 27.53% | **FAIL** | `ce6723c2-dirty` |  |
| 2026-10-31 06:30 | product | 380 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 06:30 | product | 768 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 06:30 | product | 1440 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 06:34 | product | 380 | 36.58% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 06:36 | product | 768 | 29.82% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 06:38 | product | 1440 | 20.52% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 06:40 | product | 380 | 36.58% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 06:42 | product | 768 | 29.82% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 06:44 | product | 1440 | 20.52% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 06:47 | category | 380 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 06:47 | category | 768 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 06:47 | category | 1440 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 07:04 | home | 380 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 07:04 | home | 768 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 07:04 | home | 1440 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 07:07 | product | 380 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 07:07 | product | 768 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 07:07 | product | 1440 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 07:09 | product | 380 | 36.58% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 07:12 | product | 768 | 29.82% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 07:14 | product | 1440 | 20.52% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 07:17 | product | 380 | 36.58% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 07:20 | product | 768 | 29.82% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 07:23 | product | 1440 | 20.52% | **FAIL** | `19f0920b-dirty` |  |
| 2026-10-31 07:25 | category | 380 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 07:25 | category | 768 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 07:25 | category | 1440 | n/a | REFUSED | `19f0920b-dirty` | live side is our-build |
| 2026-10-31 07:44 | home | 380 | 39.84% | **FAIL** | `346d2180-dirty` |  |
| 2026-10-31 07:46 | home | 768 | 36.52% | **FAIL** | `346d2180-dirty` |  |
| 2026-10-31 07:48 | home | 1440 | 27.52% | **FAIL** | `346d2180-dirty` |  |
| 2026-10-31 07:50 | home | 380 | 39.84% | **FAIL** | `346d2180-dirty` |  |
| 2026-10-31 07:52 | home | 768 | 36.52% | **FAIL** | `346d2180-dirty` |  |
| 2026-10-31 07:54 | home | 1440 | 27.52% | **FAIL** | `346d2180-dirty` |  |
| 2026-10-31 07:57 | product | 380 | n/a | REFUSED | `8f492ac7-dirty` | live side is our-build |
| 2026-10-31 07:57 | product | 768 | n/a | REFUSED | `8f492ac7-dirty` | live side is our-build |
| 2026-10-31 07:57 | product | 1440 | n/a | REFUSED | `8f492ac7-dirty` | live side is our-build |
| 2026-10-31 07:58 | category | 380 | n/a | REFUSED | `8f492ac7-dirty` | live side is our-build |
| 2026-10-31 07:58 | category | 768 | n/a | REFUSED | `8f492ac7-dirty` | live side is our-build |
| 2026-10-31 07:58 | category | 1440 | n/a | REFUSED | `8f492ac7-dirty` | live side is our-build |
| 2026-10-31 08:18 | home | 380 | 39.85% | **FAIL** | `e74c4da6-dirty` |  |
| 2026-10-31 08:20 | home | 768 | 36.59% | **FAIL** | `e74c4da6-dirty` |  |
| 2026-10-31 08:22 | home | 1440 | 27.52% | **FAIL** | `e74c4da6-dirty` |  |
| 2026-10-31 08:24 | home | 380 | 39.84% | **FAIL** | `e74c4da6-dirty` |  |
| 2026-10-31 08:26 | home | 768 | 36.52% | **FAIL** | `e74c4da6-dirty` |  |
| 2026-10-31 08:28 | home | 1440 | 27.52% | **FAIL** | `e74c4da6-dirty` |  |
| 2026-10-31 08:31 | product | 380 | n/a | REFUSED | `b6f15470-dirty` | live side is our-build |
| 2026-10-31 08:31 | product | 768 | n/a | REFUSED | `b6f15470-dirty` | live side is our-build |
| 2026-10-31 08:31 | product | 1440 | n/a | REFUSED | `b6f15470-dirty` | live side is our-build |
| 2026-10-31 08:33 | product | 380 | 36.58% | **FAIL** | `b6f15470-dirty` |  |
| 2026-10-31 08:35 | product | 768 | 29.82% | **FAIL** | `b6f15470-dirty` |  |
| 2026-10-31 08:38 | product | 1440 | 20.52% | **FAIL** | `b6f15470-dirty` |  |
| 2026-10-31 08:41 | product | 380 | 36.58% | **FAIL** | `b6f15470-dirty` |  |
| 2026-10-31 08:44 | product | 768 | 29.82% | **FAIL** | `b6f15470-dirty` |  |
| 2026-10-31 08:47 | product | 1440 | 20.52% | **FAIL** | `b6f15470-dirty` |  |
| 2026-10-31 08:49 | category | 380 | n/a | REFUSED | `b6f15470-dirty` | live side is our-build |
| 2026-10-31 08:49 | category | 768 | n/a | REFUSED | `b6f15470-dirty` | live side is our-build |
| 2026-10-31 08:49 | category | 1440 | n/a | REFUSED | `b6f15470-dirty` | live side is our-build |
| 2026-10-31 09:14 | home | 380 | 39.85% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:16 | home | 768 | 36.53% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:18 | home | 1440 | 27.53% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:21 | home | 380 | 39.85% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:23 | home | 768 | 36.53% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:25 | home | 1440 | 27.52% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:27 | home | 380 | 39.85% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:29 | home | 768 | 36.52% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:31 | home | 1440 | 27.52% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:33 | product | 380 | n/a | REFUSED | `523fd3b5-dirty` | live side is our-build |
| 2026-10-31 09:33 | product | 768 | n/a | REFUSED | `523fd3b5-dirty` | live side is our-build |
| 2026-10-31 09:34 | product | 1440 | n/a | REFUSED | `523fd3b5-dirty` | live side is our-build |
| 2026-10-31 09:39 | product | 380 | 36.58% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:41 | product | 768 | 29.82% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:43 | product | 1440 | 20.52% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:46 | product | 380 | 36.58% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:49 | product | 768 | 29.82% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:51 | product | 1440 | 20.52% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 09:54 | category | 380 | n/a | REFUSED | `523fd3b5-dirty` | live side is our-build |
| 2026-10-31 09:54 | category | 768 | n/a | REFUSED | `523fd3b5-dirty` | live side is our-build |
| 2026-10-31 09:54 | category | 1440 | n/a | REFUSED | `523fd3b5-dirty` | live side is our-build |
| 2026-10-31 10:15 | home | 380 | 39.83% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 10:17 | home | 768 | 36.52% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 10:19 | home | 1440 | 27.52% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 10:21 | home | 380 | 39.83% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 10:23 | home | 768 | 36.52% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 10:25 | home | 1440 | 27.52% | **FAIL** | `523fd3b5-dirty` |  |
| 2026-10-31 10:28 | product | 380 | n/a | REFUSED | `0ac19610-dirty` | live side is our-build |
| 2026-10-31 10:28 | product | 768 | n/a | REFUSED | `0ac19610-dirty` | live side is our-build |
| 2026-10-31 10:28 | product | 1440 | n/a | REFUSED | `0ac19610-dirty` | live side is our-build |
| 2026-10-31 10:31 | product | 380 | 36.58% | **FAIL** | `0ac19610-dirty` |  |
| 2026-10-31 10:34 | product | 768 | 29.82% | **FAIL** | `0ac19610-dirty` |  |
| 2026-10-31 10:36 | product | 1440 | 20.52% | **FAIL** | `0ac19610-dirty` |  |
| 2026-10-31 11:14 | home | 380 | n/a | REFUSED | `0ac19610-dirty` | live side is our-build |
| 2026-10-31 11:14 | home | 768 | n/a | REFUSED | `0ac19610-dirty` | live side is our-build |
| 2026-10-31 11:21 | category | 380 | n/a | REFUSED | `0ac19610-dirty` | live side is our-build |
| 2026-10-31 11:21 | category | 768 | n/a | REFUSED | `0ac19610-dirty` | live side is our-build |
| 2026-10-31 11:21 | category | 1440 | n/a | REFUSED | `0ac19610-dirty` | live side is our-build |
| 2026-10-31 11:49 | home | 380 | 39.83% | **FAIL** | `0ac19610-dirty` |  |
| 2026-10-31 11:51 | home | 768 | 36.52% | **FAIL** | `0ac19610-dirty` |  |
| 2026-10-31 11:53 | home | 1440 | 27.52% | **FAIL** | `0ac19610-dirty` |  |
| 2026-10-31 11:56 | home | 380 | 39.84% | **FAIL** | `0ac19610-dirty` |  |
| 2026-10-31 11:58 | home | 768 | 36.52% | **FAIL** | `0ac19610-dirty` |  |
| 2026-10-31 12:00 | home | 1440 | 27.52% | **FAIL** | `0ac19610-dirty` |  |
| 2026-10-31 12:03 | product | 380 | n/a | REFUSED | `31188769-dirty` | live side is our-build |
| 2026-10-31 12:03 | product | 768 | n/a | REFUSED | `31188769-dirty` | live side is our-build |
| 2026-10-31 12:03 | product | 1440 | n/a | REFUSED | `31188769-dirty` | live side is our-build |
| 2026-10-31 12:05 | category | 380 | n/a | REFUSED | `31188769-dirty` | live side is our-build |
| 2026-10-31 12:05 | category | 768 | n/a | REFUSED | `31188769-dirty` | live side is our-build |
| 2026-10-31 12:05 | category | 1440 | n/a | REFUSED | `31188769-dirty` | live side is our-build |
| 2026-10-31 12:33 | home | 380 | 39.83% | **FAIL** | `31188769-dirty` |  |
| 2026-10-31 12:35 | home | 768 | 36.52% | **FAIL** | `31188769-dirty` |  |
| 2026-10-31 12:37 | home | 1440 | 27.52% | **FAIL** | `31188769-dirty` |  |
| 2026-10-31 12:39 | home | 380 | 39.85% | **FAIL** | `31188769-dirty` |  |
| 2026-10-31 12:41 | home | 768 | 36.53% | **FAIL** | `31188769-dirty` |  |
| 2026-10-31 12:43 | home | 1440 | 27.53% | **FAIL** | `31188769-dirty` |  |
| 2026-10-31 12:58 | category | 380 | n/a | REFUSED | `31188769-dirty` | live side is our-build |
| 2026-10-31 12:59 | category | 768 | n/a | REFUSED | `31188769-dirty` | live side is our-build |
| 2026-10-31 12:59 | category | 1440 | n/a | REFUSED | `31188769-dirty` | live side is our-build |
| 2026-10-31 13:18 | home | 380 | 39.85% | **FAIL** | `780e0d66-dirty` |  |
| 2026-10-31 13:20 | home | 768 | 36.53% | **FAIL** | `780e0d66-dirty` |  |
| 2026-10-31 13:22 | home | 1440 | 27.52% | **FAIL** | `780e0d66-dirty` |  |
| 2026-10-31 13:25 | home | 380 | 39.84% | **FAIL** | `780e0d66-dirty` |  |
| 2026-10-31 13:27 | home | 768 | 36.52% | **FAIL** | `780e0d66-dirty` |  |
| 2026-10-31 13:29 | home | 1440 | 27.52% | **FAIL** | `780e0d66-dirty` |  |
| 2026-10-31 13:31 | product | 380 | n/a | REFUSED | `288db820-dirty` | live side is our-build |
| 2026-10-31 13:31 | product | 768 | n/a | REFUSED | `288db820-dirty` | live side is our-build |
| 2026-10-31 13:31 | product | 1440 | n/a | REFUSED | `288db820-dirty` | live side is our-build |
| 2026-10-31 13:33 | category | 380 | n/a | REFUSED | `288db820-dirty` | live side is our-build |
| 2026-10-31 13:33 | category | 768 | n/a | REFUSED | `288db820-dirty` | live side is our-build |
| 2026-10-31 13:33 | category | 1440 | n/a | REFUSED | `288db820-dirty` | live side is our-build |
| 2026-10-31 14:02 | home | 380 | 39.85% | **FAIL** | `288db820-dirty` |  |
| 2026-10-31 14:04 | home | 768 | 36.53% | **FAIL** | `288db820-dirty` |  |
| 2026-10-31 14:06 | home | 1440 | 27.53% | **FAIL** | `288db820-dirty` |  |
| 2026-10-31 14:08 | home | 380 | 39.83% | **FAIL** | `288db820-dirty` |  |
| 2026-10-31 14:10 | home | 768 | 36.52% | **FAIL** | `288db820-dirty` |  |
| 2026-10-31 14:12 | home | 1440 | 27.52% | **FAIL** | `288db820-dirty` |  |
