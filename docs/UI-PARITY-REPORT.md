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
| 2026-09-09 08:59 | home | 1440 | n/a | REFUSED | `d1adea146-dirty` | live side is our-build |
| 2026-09-09 08:59 | home | 1440 | n/a | REFUSED | `d1adea146-dirty` | live side is our-build |
| 2026-10-07 02:54 | home | 380 | n/a | REFUSED | `864f8b624-dirty` | live side is our-build |
| 2026-10-07 02:54 | home | 768 | n/a | REFUSED | `864f8b624-dirty` | live side is our-build |
| 2026-10-07 02:55 | home | 1440 | n/a | REFUSED | `864f8b624-dirty` | live side is unknown |
| 2026-10-07 03:01 | product | 380 | n/a | REFUSED | `ebf111018-dirty` | live side is our-build |
| 2026-10-07 03:01 | product | 768 | n/a | REFUSED | `ebf111018-dirty` | live side is our-build |
| 2026-10-07 03:02 | product | 1440 | n/a | REFUSED | `ebf111018-dirty` | live side is our-build |
| 2026-10-07 03:10 | category | 380 | n/a | REFUSED | `b5c49b7b1-dirty` | live side is our-build |
| 2026-10-07 03:16 | category | 768 | n/a | REFUSED | `b5c49b7b1-dirty` | live side is our-build |
| 2026-10-07 03:19 | category | 1440 | n/a | REFUSED | `b5c49b7b1-dirty` | live side is our-build |
| 2026-10-07 09:57 | product | 380 | n/a | REFUSED | `b46459d15-dirty` | live side is our-build |
| 2026-10-07 09:58 | product | 768 | n/a | REFUSED | `b46459d15-dirty` | live side is our-build |
| 2026-10-07 09:58 | product | 1440 | n/a | REFUSED | `b46459d15-dirty` | live side is our-build |
| 2026-10-07 09:58 | product | 380 | n/a | REFUSED | `b46459d15-dirty` | live side is our-build |
| 2026-10-07 10:02 | category | 380 | n/a | REFUSED | `712fc1912-dirty` | live side is our-build |
| 2026-10-07 10:03 | category | 768 | n/a | REFUSED | `712fc1912-dirty` | live side is our-build |
| 2026-10-07 10:03 | category | 1440 | n/a | REFUSED | `712fc1912-dirty` | live side is our-build |
| 2026-10-07 12:44 | home | 380 | n/a | REFUSED | `154b6c0d8-dirty` | live side is our-build |
| 2026-10-07 12:44 | home | 768 | n/a | REFUSED | `154b6c0d8-dirty` | live side is our-build |
| 2026-10-07 12:44 | home | 1440 | n/a | REFUSED | `154b6c0d8-dirty` | live side is our-build |
| 2026-10-07 12:44 | product | 380 | n/a | REFUSED | `154b6c0d8-dirty` | live side is our-build |
| 2026-10-07 12:44 | product | 768 | n/a | REFUSED | `154b6c0d8-dirty` | live side is our-build |
| 2026-10-07 12:44 | product | 1440 | n/a | REFUSED | `154b6c0d8-dirty` | live side is our-build |
| 2026-10-07 12:55 | home | 380 | n/a | REFUSED | `e9cab16c4-dirty` | live side is our-build |
| 2026-10-07 12:55 | home | 768 | n/a | REFUSED | `e9cab16c4-dirty` | live side is our-build |
| 2026-10-07 12:55 | home | 1440 | n/a | REFUSED | `e9cab16c4-dirty` | live side is our-build |
| 2026-10-07 13:01 | product | 380 | n/a | REFUSED | `0e3d131e7-dirty` | live side is our-build |
| 2026-10-07 13:01 | product | 768 | n/a | REFUSED | `0e3d131e7-dirty` | live side is our-build |
| 2026-10-07 13:02 | product | 1440 | n/a | REFUSED | `0e3d131e7-dirty` | live side is our-build |
| 2026-10-07 13:03 | product | 380 | n/a | REFUSED | `0e3d131e7-dirty` | live side is our-build |
| 2026-10-07 13:03 | product | 768 | n/a | REFUSED | `0e3d131e7-dirty` | live side is our-build |
| 2026-10-07 13:03 | product | 1440 | n/a | REFUSED | `0e3d131e7-dirty` | live side is our-build |
| 2026-10-07 13:07 | category | 380 | n/a | REFUSED | `b4d0adb7c-dirty` | live side is our-build |
| 2026-10-07 13:08 | category | 768 | n/a | REFUSED | `b4d0adb7c-dirty` | live side is our-build |
| 2026-10-07 13:08 | category | 1440 | n/a | REFUSED | `b4d0adb7c-dirty` | live side is our-build |
| 2026-10-07 13:08 | category | 380 | n/a | REFUSED | `b4d0adb7c-dirty` | live side is our-build |
| 2026-10-07 15:12 | home | 380 | n/a | REFUSED | `4b37b6f47-dirty` | live side is our-build |
| 2026-10-07 15:13 | home | 768 | n/a | REFUSED | `4b37b6f47-dirty` | live side is our-build |
| 2026-10-07 15:13 | home | 1440 | n/a | REFUSED | `4b37b6f47-dirty` | live side is our-build |
| 2026-10-07 15:13 | product | 380 | n/a | REFUSED | `4b37b6f47-dirty` | live side is our-build |
| 2026-10-07 15:13 | product | 768 | n/a | REFUSED | `4b37b6f47-dirty` | live side is our-build |
| 2026-10-07 15:14 | product | 1440 | n/a | REFUSED | `4b37b6f47-dirty` | live side is our-build |
| 2026-10-07 15:26 | home | 380 | n/a | REFUSED | `593a81f3a-dirty` | live side is our-build |
| 2026-10-07 15:26 | home | 768 | n/a | REFUSED | `593a81f3a-dirty` | live side is our-build |
| 2026-10-07 15:26 | home | 1440 | n/a | REFUSED | `593a81f3a-dirty` | live side is our-build |
| 2026-10-07 15:27 | home | 380 | n/a | REFUSED | `593a81f3a-dirty` | live side is our-build |
| 2026-10-07 15:32 | product | 380 | n/a | REFUSED | `39314fbe8-dirty` | live side is our-build |
| 2026-10-07 15:32 | product | 768 | n/a | REFUSED | `39314fbe8-dirty` | live side is our-build |
| 2026-10-07 15:32 | product | 1440 | n/a | REFUSED | `39314fbe8-dirty` | live side is our-build |
| 2026-10-07 15:34 | product | 380 | n/a | REFUSED | `39314fbe8-dirty` | live side is our-build |
| 2026-10-07 15:55 | category | 380 | n/a | REFUSED | `8816a2853-dirty` | live side is our-build |
| 2026-10-07 15:55 | category | 768 | n/a | REFUSED | `8816a2853-dirty` | live side is our-build |
| 2026-10-07 15:55 | category | 1440 | n/a | REFUSED | `8816a2853-dirty` | live side is our-build |
| 2026-10-07 15:55 | category | 380 | n/a | REFUSED | `8816a2853-dirty` | live side is our-build |
| 2026-10-07 18:44 | home | 380 | n/a | REFUSED | `097130642-dirty` | live side is our-build |
| 2026-10-07 18:44 | home | 768 | n/a | REFUSED | `097130642-dirty` | live side is our-build |
| 2026-10-07 18:45 | home | 1440 | n/a | REFUSED | `097130642-dirty` | live side is our-build |
| 2026-10-07 18:45 | product | 380 | n/a | REFUSED | `097130642-dirty` | live side is our-build |
| 2026-10-07 18:45 | product | 768 | n/a | REFUSED | `097130642-dirty` | live side is our-build |
| 2026-10-07 18:45 | product | 1440 | n/a | REFUSED | `097130642-dirty` | live side is our-build |
| 2026-10-07 18:52 | home | 380 | n/a | REFUSED | `71b5c4852-dirty` | live side is our-build |
| 2026-10-07 18:52 | home | 768 | n/a | REFUSED | `71b5c4852-dirty` | live side is our-build |
| 2026-10-07 18:53 | home | 1440 | n/a | REFUSED | `71b5c4852-dirty` | live side is our-build |
| 2026-10-07 18:53 | home | 380 | n/a | REFUSED | `71b5c4852-dirty` | live side is our-build |
| 2026-10-07 19:01 | product | 380 | n/a | REFUSED | `359b266f8-dirty` | live side is our-build |
| 2026-10-07 19:02 | product | 768 | n/a | REFUSED | `359b266f8-dirty` | live side is our-build |
| 2026-10-07 19:02 | product | 1440 | n/a | REFUSED | `359b266f8-dirty` | live side is our-build |
| 2026-10-07 19:02 | product | 380 | n/a | REFUSED | `359b266f8-dirty` | live side is our-build |
| 2026-10-07 19:11 | category | 380 | n/a | REFUSED | `f07c9ea9b-dirty` | live side is our-build |
| 2026-10-07 19:11 | category | 768 | n/a | REFUSED | `f07c9ea9b-dirty` | live side is our-build |
| 2026-10-07 19:12 | category | 1440 | n/a | REFUSED | `f07c9ea9b-dirty` | live side is our-build |
| 2026-10-07 19:12 | category | 380 | n/a | REFUSED | `f07c9ea9b-dirty` | live side is our-build |
| 2026-10-07 22:01 | home | 380 | n/a | REFUSED | `f87cda297-dirty` | live side is our-build |
| 2026-10-07 22:01 | home | 768 | n/a | REFUSED | `f87cda297-dirty` | live side is our-build |
| 2026-10-07 22:01 | home | 1440 | n/a | REFUSED | `f87cda297-dirty` | live side is our-build |
| 2026-10-07 22:02 | product | 380 | n/a | REFUSED | `f87cda297-dirty` | live side is our-build |
| 2026-10-07 22:02 | product | 768 | n/a | REFUSED | `f87cda297-dirty` | live side is our-build |
| 2026-10-07 22:02 | product | 1440 | n/a | REFUSED | `f87cda297-dirty` | live side is our-build |
| 2026-10-07 22:34 | home | 380 | n/a | REFUSED | `903d09184-dirty` | live side is our-build |
| 2026-10-07 22:34 | home | 768 | n/a | REFUSED | `903d09184-dirty` | live side is our-build |
| 2026-10-07 22:35 | home | 1440 | n/a | REFUSED | `903d09184-dirty` | live side is our-build |
| 2026-10-07 22:36 | home | 380 | n/a | REFUSED | `903d09184-dirty` | live side is our-build |
| 2026-10-07 23:45 | product | 380 | n/a | REFUSED | `db95e4b71-dirty` | live side is our-build |
| 2026-10-07 23:46 | product | 768 | n/a | REFUSED | `db95e4b71-dirty` | live side is our-build |
| 2026-10-07 23:47 | product | 1440 | n/a | REFUSED | `db95e4b71-dirty` | live side is our-build |
| 2026-10-07 23:55 | category | 380 | n/a | REFUSED | `7c00a93cb-dirty` | live side is our-build |
| 2026-10-07 23:59 | category | 768 | n/a | REFUSED | `7c00a93cb-dirty` | live side is our-build |
| 2026-10-07 23:59 | category | 1440 | n/a | REFUSED | `7c00a93cb-dirty` | live side is our-build |
| 2026-10-08 07:23 | home | 380 | n/a | REFUSED | `1f74ce7ce-dirty` | live side is our-build |
| 2026-10-08 07:23 | home | 768 | n/a | REFUSED | `1f74ce7ce-dirty` | live side is our-build |
| 2026-10-08 07:24 | home | 1440 | n/a | REFUSED | `1f74ce7ce-dirty` | live side is our-build |
| 2026-10-08 07:24 | product | 380 | n/a | REFUSED | `1f74ce7ce-dirty` | live side is our-build |
| 2026-10-08 07:24 | product | 768 | n/a | REFUSED | `1f74ce7ce-dirty` | live side is our-build |
| 2026-10-08 07:25 | product | 1440 | n/a | REFUSED | `1f74ce7ce-dirty` | live side is our-build |
| 2026-10-08 08:01 | home | 380 | n/a | REFUSED | `3aebfa1b2-dirty` | live side is our-build |
| 2026-10-08 08:01 | home | 768 | n/a | REFUSED | `3aebfa1b2-dirty` | live side is our-build |
| 2026-10-08 08:01 | home | 1440 | n/a | REFUSED | `3aebfa1b2-dirty` | live side is our-build |
| 2026-10-08 08:01 | home | 380 | n/a | REFUSED | `3aebfa1b2-dirty` | live side is our-build |
| 2026-10-08 08:11 | product | 380 | n/a | REFUSED | `dae9f65c1-dirty` | live side is our-build |
| 2026-10-08 08:11 | product | 768 | n/a | REFUSED | `dae9f65c1-dirty` | live side is our-build |
| 2026-10-08 08:12 | product | 1440 | n/a | REFUSED | `dae9f65c1-dirty` | live side is our-build |
| 2026-10-08 08:13 | category | 380 | n/a | REFUSED | `96c3a2f6f-dirty` | live side is our-build |
| 2026-10-08 08:13 | category | 768 | n/a | REFUSED | `96c3a2f6f-dirty` | live side is our-build |
| 2026-10-08 08:13 | category | 1440 | n/a | REFUSED | `96c3a2f6f-dirty` | live side is our-build |
| 2026-10-08 08:13 | category | 380 | n/a | REFUSED | `96c3a2f6f-dirty` | live side is our-build |
| 2026-10-08 08:14 | category | 768 | n/a | REFUSED | `96c3a2f6f-dirty` | live side is our-build |
| 2026-10-08 08:14 | category | 1440 | n/a | REFUSED | `96c3a2f6f-dirty` | live side is our-build |
| 2026-10-08 13:34 | home | 380 | n/a | REFUSED | `2d2a30c90-dirty` | live side is our-build |
| 2026-10-08 13:34 | home | 768 | n/a | REFUSED | `2d2a30c90-dirty` | live side is our-build |
| 2026-10-08 13:34 | home | 1440 | n/a | REFUSED | `2d2a30c90-dirty` | live side is our-build |
| 2026-10-08 13:34 | product | 380 | n/a | REFUSED | `2d2a30c90-dirty` | live side is our-build |
| 2026-10-08 13:34 | product | 768 | n/a | REFUSED | `2d2a30c90-dirty` | live side is our-build |
| 2026-10-08 13:34 | product | 1440 | n/a | REFUSED | `2d2a30c90-dirty` | live side is our-build |
| 2026-10-08 13:53 | home | 380 | n/a | REFUSED | `aee3bcdce-dirty` | live side is our-build |
| 2026-10-08 13:53 | home | 768 | n/a | REFUSED | `aee3bcdce-dirty` | live side is our-build |
| 2026-10-08 13:54 | home | 1440 | n/a | REFUSED | `aee3bcdce-dirty` | live side is our-build |
| 2026-10-08 14:03 | product | 380 | n/a | REFUSED | `b0f797a38-dirty` | live side is our-build |
| 2026-10-08 14:03 | product | 768 | n/a | REFUSED | `b0f797a38-dirty` | live side is our-build |
| 2026-10-08 14:03 | product | 1440 | n/a | REFUSED | `b0f797a38-dirty` | live side is our-build |
| 2026-10-08 14:03 | product | 380 | n/a | REFUSED | `b0f797a38-dirty` | live side is our-build |
| 2026-10-08 14:05 | category | 380 | n/a | REFUSED | `0404276c6-dirty` | live side is our-build |
| 2026-10-08 14:05 | category | 768 | n/a | REFUSED | `0404276c6-dirty` | live side is our-build |
| 2026-10-08 14:05 | category | 1440 | n/a | REFUSED | `0404276c6-dirty` | live side is our-build |
| 2026-10-08 21:25 | home | 380 | n/a | REFUSED | `4d9286321-dirty` | live side is our-build |
| 2026-10-08 21:25 | home | 768 | n/a | REFUSED | `4d9286321-dirty` | live side is our-build |
| 2026-10-08 21:25 | home | 1440 | n/a | REFUSED | `4d9286321-dirty` | live side is our-build |
| 2026-10-08 21:25 | product | 380 | n/a | REFUSED | `4d9286321-dirty` | live side is our-build |
| 2026-10-08 21:26 | product | 768 | n/a | REFUSED | `4d9286321-dirty` | live side is our-build |
| 2026-10-08 21:26 | product | 1440 | n/a | REFUSED | `4d9286321-dirty` | live side is our-build |
| 2026-10-08 21:46 | home | 380 | n/a | REFUSED | `e43eab6b8-dirty` | live side is our-build |
| 2026-10-08 21:46 | home | 768 | n/a | REFUSED | `e43eab6b8-dirty` | live side is our-build |
| 2026-10-08 21:47 | home | 1440 | n/a | REFUSED | `e43eab6b8-dirty` | live side is our-build |
| 2026-10-08 21:47 | home | 380 | n/a | REFUSED | `e43eab6b8-dirty` | live side is our-build |
| 2026-10-08 21:47 | home | 768 | n/a | REFUSED | `e43eab6b8-dirty` | live side is our-build |
| 2026-10-08 21:47 | home | 1440 | n/a | REFUSED | `e43eab6b8-dirty` | live side is our-build |
| 2026-10-08 22:13 | product | 380 | n/a | REFUSED | `8b4a870f6-dirty` | live side is our-build |
| 2026-10-08 22:14 | product | 768 | n/a | REFUSED | `8b4a870f6-dirty` | live side is our-build |
| 2026-10-08 22:15 | product | 1440 | n/a | REFUSED | `8b4a870f6-dirty` | live side is our-build |
| 2026-10-08 22:15 | product | 380 | n/a | REFUSED | `8b4a870f6-dirty` | live side is our-build |
| 2026-10-08 22:16 | product | 768 | n/a | REFUSED | `8b4a870f6-dirty` | live side is our-build |
| 2026-10-08 22:17 | product | 1440 | n/a | REFUSED | `8b4a870f6-dirty` | live side is our-build |
| 2026-10-08 22:25 | category | 380 | n/a | REFUSED | `76b8c6ce5-dirty` | live side is our-build |
| 2026-10-08 22:25 | category | 768 | n/a | REFUSED | `76b8c6ce5-dirty` | live side is our-build |
| 2026-10-08 22:25 | category | 1440 | n/a | REFUSED | `76b8c6ce5-dirty` | live side is our-build |
| 2026-10-09 10:53 | home | 380 | n/a | REFUSED | `208d8fcd1-dirty` | live side is our-build |
| 2026-10-09 10:53 | home | 768 | n/a | REFUSED | `208d8fcd1-dirty` | live side is our-build |
| 2026-10-09 10:53 | home | 1440 | n/a | REFUSED | `208d8fcd1-dirty` | live side is our-build |
| 2026-10-09 10:54 | product | 380 | n/a | REFUSED | `719a2ee87-dirty` | live side is our-build |
| 2026-10-09 10:54 | product | 768 | n/a | REFUSED | `719a2ee87-dirty` | live side is our-build |
| 2026-10-09 10:55 | product | 1440 | n/a | REFUSED | `719a2ee87-dirty` | live side is our-build |
| 2026-10-09 10:55 | product | 380 | n/a | REFUSED | `719a2ee87-dirty` | live side is our-build |
| 2026-10-09 10:59 | category | 380 | n/a | REFUSED | `6ee702405-dirty` | live side is our-build |
| 2026-10-09 10:59 | category | 768 | n/a | REFUSED | `6ee702405-dirty` | live side is our-build |
| 2026-10-09 10:59 | category | 1440 | n/a | REFUSED | `6ee702405-dirty` | live side is our-build |
| 2026-10-09 12:00 | home | 1440 | n/a | REFUSED | `9b244d7fc-dirty` | live side is our-build |
| 2026-10-09 12:00 | home | 1440 | n/a | REFUSED | `9b244d7fc-dirty` | live side is our-build |
| 2026-10-09 12:00 | home | 1440 | n/a | REFUSED | `9b244d7fc-dirty` | live side is our-build |
| 2026-10-09 12:00 | home | 380 | n/a | REFUSED | `9b244d7fc-dirty` | live side is our-build |
| 2026-10-09 12:00 | home | 768 | n/a | REFUSED | `9b244d7fc-dirty` | live side is our-build |
| 2026-10-09 12:01 | home | 1440 | n/a | REFUSED | `9b244d7fc-dirty` | live side is our-build |
| 2026-10-09 12:01 | product | 380 | n/a | REFUSED | `9b244d7fc-dirty` | live side is our-build |
| 2026-10-09 12:01 | product | 768 | n/a | REFUSED | `9b244d7fc-dirty` | live side is our-build |
| 2026-10-09 12:01 | product | 1440 | n/a | REFUSED | `9b244d7fc-dirty` | live side is our-build |
| 2026-10-09 12:09 | home | 380 | n/a | REFUSED | `fc3b2743f-dirty` | live side is our-build |
| 2026-10-09 12:09 | home | 768 | n/a | REFUSED | `fc3b2743f-dirty` | live side is our-build |
| 2026-10-09 12:09 | home | 1440 | n/a | REFUSED | `fc3b2743f-dirty` | live side is our-build |
| 2026-10-09 12:15 | product | 380 | n/a | REFUSED | `a0fa1c2a1-dirty` | live side is our-build |
| 2026-10-09 12:15 | product | 768 | n/a | REFUSED | `a0fa1c2a1-dirty` | live side is our-build |
| 2026-10-09 12:15 | product | 1440 | n/a | REFUSED | `a0fa1c2a1-dirty` | live side is our-build |
| 2026-10-09 12:17 | category | 380 | n/a | REFUSED | `a02ff8ab9-dirty` | live side is our-build |
| 2026-10-09 12:17 | category | 768 | n/a | REFUSED | `a02ff8ab9-dirty` | live side is our-build |
| 2026-10-09 12:17 | category | 1440 | n/a | REFUSED | `a02ff8ab9-dirty` | live side is our-build |
| 2026-10-09 12:18 | category | 380 | n/a | REFUSED | `a02ff8ab9-dirty` | live side is our-build |
| 2026-10-09 12:18 | category | 768 | n/a | REFUSED | `a02ff8ab9-dirty` | live side is our-build |
| 2026-10-09 12:18 | category | 1440 | n/a | REFUSED | `a02ff8ab9-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 1440 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 1440 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 1440 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 1440 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 1440 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 1440 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 1440 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 1440 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 1440 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 380 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 768 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | home | 1440 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | product | 380 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:07 | product | 768 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:08 | product | 1440 | n/a | REFUSED | `14a635377-dirty` | live side is our-build |
| 2026-10-09 13:15 | home | 1440 | n/a | REFUSED | `7afb8c707-dirty` | live side is our-build |
| 2026-10-09 13:15 | home | 1440 | n/a | REFUSED | `7afb8c707-dirty` | live side is our-build |
| 2026-10-09 13:15 | home | 1440 | n/a | REFUSED | `7afb8c707-dirty` | live side is our-build |
| 2026-10-09 13:15 | home | 1440 | n/a | REFUSED | `7afb8c707-dirty` | live side is our-build |
| 2026-10-09 13:15 | home | 1440 | n/a | REFUSED | `7afb8c707-dirty` | live side is our-build |
| 2026-10-09 13:15 | home | 1440 | n/a | REFUSED | `7afb8c707-dirty` | live side is our-build |
| 2026-10-09 13:19 | product | 380 | n/a | REFUSED | `4dd880a57-dirty` | live side is our-build |
| 2026-10-09 13:19 | product | 768 | n/a | REFUSED | `4dd880a57-dirty` | live side is our-build |
| 2026-10-09 13:19 | product | 1440 | n/a | REFUSED | `4dd880a57-dirty` | live side is our-build |
| 2026-10-09 13:22 | category | 380 | n/a | REFUSED | `0dc47169e-dirty` | live side is our-build |
| 2026-10-09 13:22 | category | 768 | n/a | REFUSED | `0dc47169e-dirty` | live side is our-build |
| 2026-10-09 13:22 | category | 1440 | n/a | REFUSED | `0dc47169e-dirty` | live side is our-build |
| 2026-10-09 14:30 | home | 380 | n/a | REFUSED | `7c49a6e6d-dirty` | live side is our-build |
| 2026-10-09 14:30 | home | 768 | n/a | REFUSED | `7c49a6e6d-dirty` | live side is our-build |
| 2026-10-09 14:30 | home | 1440 | n/a | REFUSED | `7c49a6e6d-dirty` | live side is our-build |
| 2026-10-09 14:34 | product | 380 | n/a | REFUSED | `da2b83321-dirty` | live side is our-build |
| 2026-10-09 14:34 | product | 768 | n/a | REFUSED | `da2b83321-dirty` | live side is our-build |
| 2026-10-09 14:34 | product | 1440 | n/a | REFUSED | `da2b83321-dirty` | live side is our-build |
| 2026-10-09 14:40 | category | 380 | n/a | REFUSED | `01b0d6566-dirty` | live side is our-build |
| 2026-10-09 14:40 | category | 768 | n/a | REFUSED | `01b0d6566-dirty` | live side is our-build |
| 2026-10-09 14:40 | category | 1440 | n/a | REFUSED | `01b0d6566-dirty` | live side is our-build |
| 2026-10-09 15:53 | home | 1440 | n/a | REFUSED | `780142f0b-dirty` | live side is our-build |
| 2026-10-09 15:53 | home | 1440 | n/a | REFUSED | `780142f0b-dirty` | live side is our-build |
| 2026-10-09 15:53 | home | 1440 | n/a | REFUSED | `780142f0b-dirty` | live side is our-build |
| 2026-10-09 15:53 | home | 1440 | n/a | REFUSED | `780142f0b-dirty` | live side is our-build |
| 2026-10-09 15:53 | home | 1440 | n/a | REFUSED | `780142f0b-dirty` | live side is our-build |
| 2026-10-09 15:53 | home | 1440 | n/a | REFUSED | `780142f0b-dirty` | live side is our-build |
| 2026-10-09 15:57 | home | 1440 | n/a | REFUSED | `4542f3c4e-dirty` | live side is our-build |
| 2026-10-09 15:57 | home | 1440 | n/a | REFUSED | `4542f3c4e-dirty` | live side is our-build |
| 2026-10-09 15:57 | home | 1440 | n/a | REFUSED | `4542f3c4e-dirty` | live side is our-build |
| 2026-10-09 16:01 | category | 380 | n/a | REFUSED | `b89eeacc3-dirty` | live side is our-build |
| 2026-10-09 16:01 | category | 768 | n/a | REFUSED | `b89eeacc3-dirty` | live side is our-build |
| 2026-10-09 16:01 | category | 1440 | n/a | REFUSED | `b89eeacc3-dirty` | live side is our-build |
| 2026-10-09 17:08 | home | 1440 | n/a | REFUSED | `a5864216a-dirty` | live side is our-build |
| 2026-10-09 17:08 | home | 1440 | n/a | REFUSED | `a5864216a-dirty` | live side is our-build |
| 2026-10-09 17:08 | home | 1440 | n/a | REFUSED | `a5864216a-dirty` | live side is our-build |
| 2026-10-09 17:12 | product | 380 | n/a | REFUSED | `a9d11a801-dirty` | live side is our-build |
| 2026-10-09 17:12 | product | 768 | n/a | REFUSED | `a9d11a801-dirty` | live side is our-build |
| 2026-10-09 17:13 | product | 1440 | n/a | REFUSED | `a9d11a801-dirty` | live side is our-build |
| 2026-10-09 17:16 | category | 380 | n/a | REFUSED | `15e7411e0-dirty` | live side is our-build |
| 2026-10-09 17:16 | category | 768 | n/a | REFUSED | `15e7411e0-dirty` | live side is our-build |
| 2026-10-09 17:16 | category | 1440 | n/a | REFUSED | `15e7411e0-dirty` | live side is our-build |
| 2026-10-09 18:16 | home | 1440 | n/a | REFUSED | `ed735c8b1-dirty` | live side is our-build |
| 2026-10-09 18:16 | home | 1440 | n/a | REFUSED | `ed735c8b1-dirty` | live side is our-build |
| 2026-10-09 18:16 | home | 1440 | n/a | REFUSED | `ed735c8b1-dirty` | live side is our-build |
| 2026-10-09 18:19 | product | 380 | n/a | REFUSED | `12b5d5e18-dirty` | live side is our-build |
| 2026-10-09 18:20 | product | 768 | n/a | REFUSED | `12b5d5e18-dirty` | live side is our-build |
| 2026-10-09 18:20 | product | 1440 | n/a | REFUSED | `12b5d5e18-dirty` | live side is our-build |
| 2026-10-09 18:23 | category | 380 | n/a | REFUSED | `63f01874b-dirty` | live side is our-build |
| 2026-10-09 18:23 | category | 768 | n/a | REFUSED | `63f01874b-dirty` | live side is our-build |
| 2026-10-09 18:23 | category | 1440 | n/a | REFUSED | `63f01874b-dirty` | live side is our-build |
| 2026-10-09 19:28 | home | 1440 | n/a | REFUSED | `69c08607a-dirty` | live side is our-build |
| 2026-10-09 19:28 | home | 1440 | n/a | REFUSED | `69c08607a-dirty` | live side is our-build |
| 2026-10-09 19:28 | home | 1440 | n/a | REFUSED | `69c08607a-dirty` | live side is our-build |
| 2026-10-09 19:31 | product | 380 | n/a | REFUSED | `45f6b3940-dirty` | live side is our-build |
| 2026-10-09 19:31 | product | 768 | n/a | REFUSED | `45f6b3940-dirty` | live side is our-build |
| 2026-10-09 19:31 | product | 1440 | n/a | REFUSED | `45f6b3940-dirty` | live side is our-build |
| 2026-10-09 19:34 | category | 380 | n/a | REFUSED | `7a5668dd3-dirty` | live side is our-build |
| 2026-10-09 19:34 | category | 768 | n/a | REFUSED | `7a5668dd3-dirty` | live side is our-build |
| 2026-10-09 19:34 | category | 1440 | n/a | REFUSED | `7a5668dd3-dirty` | live side is our-build |
| 2026-10-09 20:32 | home | 1440 | n/a | REFUSED | `0cf8856e8-dirty` | live side is our-build |
| 2026-10-09 20:32 | home | 1440 | n/a | REFUSED | `0cf8856e8-dirty` | live side is our-build |
| 2026-10-09 20:33 | home | 1440 | n/a | REFUSED | `0cf8856e8-dirty` | live side is our-build |
| 2026-10-09 20:36 | product | 380 | n/a | REFUSED | `34a83616f-dirty` | live side is our-build |
| 2026-10-09 20:36 | product | 768 | n/a | REFUSED | `34a83616f-dirty` | live side is our-build |
| 2026-10-09 20:36 | product | 1440 | n/a | REFUSED | `34a83616f-dirty` | live side is our-build |
| 2026-10-09 20:40 | category | 380 | n/a | REFUSED | `c616d6a30-dirty` | live side is our-build |
| 2026-10-09 20:40 | category | 768 | n/a | REFUSED | `c616d6a30-dirty` | live side is our-build |
| 2026-10-09 20:40 | category | 1440 | n/a | REFUSED | `c616d6a30-dirty` | live side is our-build |
| 2026-10-09 21:39 | home | 1440 | n/a | REFUSED | `49ba93c88-dirty` | live side is our-build |
| 2026-10-09 21:39 | home | 1440 | n/a | REFUSED | `49ba93c88-dirty` | live side is our-build |
| 2026-10-09 21:39 | home | 1440 | n/a | REFUSED | `49ba93c88-dirty` | live side is our-build |
| 2026-10-09 21:43 | product | 380 | n/a | REFUSED | `ac2408566-dirty` | live side is our-build |
| 2026-10-09 21:43 | product | 768 | n/a | REFUSED | `ac2408566-dirty` | live side is our-build |
| 2026-10-09 21:43 | product | 1440 | n/a | REFUSED | `ac2408566-dirty` | live side is our-build |
| 2026-10-09 21:46 | category | 380 | n/a | REFUSED | `83b203096-dirty` | live side is our-build |
| 2026-10-09 21:46 | category | 768 | n/a | REFUSED | `83b203096-dirty` | live side is our-build |
| 2026-10-09 21:46 | category | 1440 | n/a | REFUSED | `83b203096-dirty` | live side is our-build |
| 2026-10-09 22:41 | home | 380 | n/a | REFUSED | `b03c0f88f-dirty` | live side is our-build |
| 2026-10-09 22:41 | home | 768 | n/a | REFUSED | `b03c0f88f-dirty` | live side is our-build |
| 2026-10-09 22:41 | home | 1440 | n/a | REFUSED | `b03c0f88f-dirty` | live side is our-build |
| 2026-10-09 22:44 | product | 380 | n/a | REFUSED | `9de8e4f30-dirty` | live side is our-build |
| 2026-10-09 22:44 | product | 768 | n/a | REFUSED | `9de8e4f30-dirty` | live side is our-build |
| 2026-10-09 22:44 | product | 1440 | n/a | REFUSED | `9de8e4f30-dirty` | live side is our-build |
| 2026-10-10 21:21 | home | 380 | n/a | REFUSED | `2c3adfa87-dirty` | live side is our-build |
| 2026-10-10 21:22 | home | 768 | n/a | REFUSED | `2c3adfa87-dirty` | live side is our-build |
| 2026-10-10 21:22 | home | 1440 | n/a | REFUSED | `2c3adfa87-dirty` | live side is our-build |
| 2026-10-10 21:25 | product | 380 | n/a | REFUSED | `4f0700a20-dirty` | live side is our-build |
| 2026-10-10 21:25 | product | 768 | n/a | REFUSED | `4f0700a20-dirty` | live side is our-build |
| 2026-10-10 21:25 | product | 1440 | n/a | REFUSED | `4f0700a20-dirty` | live side is our-build |
| 2026-10-10 21:28 | category | 380 | n/a | REFUSED | `1fb9b3bf2-dirty` | live side is our-build |
| 2026-10-10 21:28 | category | 768 | n/a | REFUSED | `1fb9b3bf2-dirty` | live side is our-build |
| 2026-10-10 21:28 | category | 1440 | n/a | REFUSED | `1fb9b3bf2-dirty` | live side is our-build |
| 2026-10-10 22:15 | home | 380 | n/a | REFUSED | `4de225e66-dirty` | live side is our-build |
| 2026-10-10 22:15 | home | 768 | n/a | REFUSED | `4de225e66-dirty` | live side is our-build |
| 2026-10-10 22:15 | home | 1440 | n/a | REFUSED | `4de225e66-dirty` | live side is our-build |
| 2026-10-10 22:15 | product | 380 | n/a | REFUSED | `4de225e66-dirty` | live side is our-build |
| 2026-10-10 22:15 | product | 768 | n/a | REFUSED | `4de225e66-dirty` | live side is our-build |
| 2026-10-10 22:15 | product | 1440 | n/a | REFUSED | `4de225e66-dirty` | live side is our-build |
| 2026-10-10 22:22 | home | 1440 | n/a | REFUSED | `411307378-dirty` | live side is our-build |
| 2026-10-10 22:25 | product | 380 | n/a | REFUSED | `9ccdf1416-dirty` | live side is our-build |
| 2026-10-10 22:26 | product | 768 | n/a | REFUSED | `9ccdf1416-dirty` | live side is our-build |
| 2026-10-10 22:26 | product | 1440 | n/a | REFUSED | `9ccdf1416-dirty` | live side is our-build |
