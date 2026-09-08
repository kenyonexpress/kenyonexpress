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
| 2026-09-07 02:26 | home | 380 | 10.68% | PASS | `a9b44789f` |  |
| 2026-09-07 02:28 | home | 768 | 7.72% | PASS | `a9b44789f-dirty` |  |
| 2026-09-07 02:30 | home | 1440 | 8.12% | PASS | `a9b44789f-dirty` |  |
| 2026-09-07 02:32 | home | 380 | 10.68% | PASS | `a9b44789f-dirty` |  |
| 2026-09-07 02:34 | home | 768 | 7.72% | PASS | `a9b44789f-dirty` |  |
| 2026-09-07 02:36 | home | 1440 | 8.12% | PASS | `a9b44789f-dirty` |  |
| 2026-09-07 05:43 | home | 380 | 10.68% | PASS | `dd60ac508` |  |
| 2026-09-07 05:45 | home | 768 | 7.72% | PASS | `dd60ac508-dirty` |  |
| 2026-09-07 05:47 | home | 1440 | 8.12% | PASS | `dd60ac508-dirty` |  |
| 2026-09-07 09:02 | home | 380 | 10.68% | PASS | `66963d5f5` |  |
| 2026-09-07 09:03 | home | 768 | 7.72% | PASS | `66963d5f5-dirty` |  |
| 2026-09-07 09:05 | home | 1440 | 8.12% | PASS | `66963d5f5-dirty` |  |
| 2026-09-07 09:14 | cart | 380 | 10.07% | PASS | `8c4d4960b-dirty` |  |
| 2026-09-07 09:16 | cart | 768 | 10.57% | PASS | `8c4d4960b-dirty` |  |
| 2026-09-07 09:18 | cart | 1440 | 8.16% | PASS | `8c4d4960b-dirty` |  |
| 2026-09-07 09:20 | checkout | 380 | 10.59% | PASS | `8c4d4960b-dirty` |  |
| 2026-09-07 09:22 | checkout | 768 | 10.10% | PASS | `8c4d4960b-dirty` |  |
| 2026-09-07 09:23 | checkout | 768 | 10.10% | PASS | `8c4d4960b-dirty` |  |
| 2026-09-07 09:24 | checkout | 1440 | 10.71% | PASS | `8c4d4960b-dirty` |  |
| 2026-09-07 09:25 | checkout | 1440 | 10.71% | PASS | `8c4d4960b-dirty` |  |
| 2026-09-07 22:34 | home | 380 | n/a | **UNMEASURED** | `2407d8f02-dirty` | screenshot failed: page.goto: net::ERR_CONNECTION_CLOSED at https://kenyonexpress.co.il/ Call log: [2m - navigating to "https://kenyonexpress.co.il/", waiting  |
| 2026-09-08 02:29 | home | 1440 | n/a | **UNMEASURED** | `cdfc6906c` | screenshot failed: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/ Call log: [2m - navigating to "http://localhost:3000/", waiting until "domc |
| 2026-09-08 03:33 | home | 380 | 39.76% | **FAIL** | `a692149ff-dirty` |  |
| 2026-09-08 03:35 | home | 768 | 38.50% | **FAIL** | `a692149ff-dirty` |  |
| 2026-09-08 03:37 | home | 1440 | 9.21% | PASS | `c059d6129-dirty` |  |
| 2026-09-08 03:39 | home | 1440 | 9.21% | PASS | `c059d6129-dirty` |  |
| 2026-09-08 03:42 | home | 380 | 39.76% | **FAIL** | `ab5712821-dirty` |  |
| 2026-09-08 03:49 | home | 768 | n/a | **UNMEASURED** | `ab5712821-dirty` | screenshot failed: page.goto: Timeout 60000ms exceeded. Call log: [2m - navigating to "https://kenyonexpress.co.il/", waiting until "domcontentloaded"[22m |
| 2026-09-08 03:53 | home | 768 | 38.50% | **FAIL** | `ab5712821-dirty` |  |
| 2026-09-08 03:59 | home | 380 | 39.76% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:02 | home | 380 | 39.76% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:07 | home | 380 | 27.15% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:14 | home | 380 | 29.90% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:18 | home | 768 | 29.52% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:20 | home | 1440 | 8.58% | PASS | `07da1523f-dirty` |  |
| 2026-09-08 04:22 | home | 1440 | 8.72% | PASS | `07da1523f-dirty` |  |
| 2026-09-08 04:30 | home | 380 | 30.26% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:32 | home | 768 | 28.99% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:34 | home | 1440 | 8.29% | PASS | `07da1523f-dirty` |  |
| 2026-09-08 04:35 | home | 380 | 30.26% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:37 | home | 768 | 28.99% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:39 | home | 1440 | 8.29% | PASS | `07da1523f-dirty` |  |
| 2026-09-08 04:41 | home | 380 | 30.26% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:44 | home | 380 | 30.33% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:46 | home | 768 | 29.55% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 04:48 | home | 1440 | 7.20% | PASS | `07da1523f-dirty` |  |
| 2026-09-08 04:50 | home | 768 | 29.55% | **FAIL** | `07da1523f-dirty` |  |
| 2026-09-08 10:58 | home | 380 | 30.26% | **FAIL** | `9c33e39a4-dirty` |  |
| 2026-09-08 11:00 | home | 380 | 30.26% | **FAIL** | `9c33e39a4-dirty` |  |
| 2026-09-08 11:03 | home | 380 | 30.26% | **FAIL** | `9c33e39a4-dirty` |  |
| 2026-09-08 11:06 | home | 380 | 30.26% | **FAIL** | `9c33e39a4-dirty` |  |
| 2026-09-08 11:39 | home | 380 | 30.26% | **FAIL** | `6f6a71fd0-dirty` |  |
