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
| 2026-09-08 13:02 | home | 1440 | 8.29% | PASS | `5df534cdb-dirty` |  |
| 2026-09-08 13:04 | home | 768 | 28.99% | **FAIL** | `5df534cdb-dirty` |  |
| 2026-09-08 13:06 | home | 380 | 30.26% | **FAIL** | `5df534cdb-dirty` |  |
| 2026-09-08 14:47 | home | 1440 | 8.29% | PASS | `3e4529810-dirty` | next 16.2.12, baseline before the bump |
| 2026-09-08 14:49 | home | 1440 | 8.29% | PASS | `3e4529810-dirty` | next 16.2.12, baseline before the bump, repeat run |
| 2026-09-08 14:51 | home | 380 | 30.26% | **FAIL** | `3e4529810-dirty` | next 16.2.12, baseline before the bump; KNOWN-ISSUES 3 |
| 2026-09-08 14:53 | home | 768 | 28.99% | **FAIL** | `3e4529810-dirty` | next 16.2.12, baseline before the bump; KNOWN-ISSUES 3 |
| 2026-09-08 14:59 | home | 380 | 30.26% | **FAIL** | `3e4529810-dirty` | next 16.3.4, same numbers to the hundredth; KNOWN-ISSUES 3 |
| 2026-09-08 15:01 | home | 768 | 28.99% | **FAIL** | `3e4529810-dirty` | next 16.3.4, same numbers to the hundredth; KNOWN-ISSUES 3 |
| 2026-09-08 15:03 | home | 1440 | 8.29% | PASS | `3e4529810-dirty` | next 16.3.4, same numbers to the hundredth |
| 2026-09-08 15:15 | home | 380 | 30.26% | **FAIL** | `1d52bba8c-dirty` | react 19.2.8 + radix + tailwind 4.3.3 + lucide 1.42 sweep; unchanged; KNOWN-ISSUES 3 |
| 2026-09-08 15:17 | home | 768 | 29.00% | **FAIL** | `1d52bba8c-dirty` | react 19.2.8 + radix + tailwind 4.3.3 + lucide 1.42 sweep; +0.01 on 28.99; KNOWN-ISSUES 3 |
| 2026-09-08 15:18 | home | 1440 | 8.29% | PASS | `1d52bba8c-dirty` | react 19.2.8 + radix + tailwind 4.3.3 + lucide 1.42 sweep; unchanged |
| 2026-09-08 15:20 | home | 768 | 29.00% | **FAIL** | `1d52bba8c-dirty` | react 19.2.8 + radix + tailwind 4.3.3 + lucide 1.42 sweep; repeat 2 of 3, deterministic |
| 2026-09-08 15:22 | home | 768 | 29.00% | **FAIL** | `1d52bba8c-dirty` | react 19.2.8 + radix + tailwind 4.3.3 + lucide 1.42 sweep; repeat 3 of 3, deterministic |
| 2026-09-08 15:25 | home | 1440 | 8.29% | PASS | `1d52bba8c-dirty` | react 19.2.8 + radix + tailwind 4.3.3 + lucide 1.42 sweep |
| 2026-09-08 16:33 | home | 1440 | 8.29% | PASS | `3b1cc47bb-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-09-08 16:36 | home | 1440 | 8.29% | PASS | `3b1cc47bb-dirty` | ref 97 failed to load (57 script, 37 font, 1 stylesheet, 1 image, 1 xhr) |
| 2026-09-08 16:39 | home | 380 | 30.26% | **FAIL** | `3b1cc47bb-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-09-08 18:44 | home | 1440 | 8.29% | PASS | `994f19348` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-09-08 18:47 | cart | 768 | 26.67% | **FAIL** | `994f19348-dirty` | ref 85 failed to load (54 script, 31 stylesheet) |
| 2026-09-08 18:51 | cart | 768 | 26.67% | **FAIL** | `994f19348-dirty` | ref 85 failed to load (54 script, 31 stylesheet) |
| 2026-09-08 18:53 | cart | 1440 | 16.34% | **FAIL** | `994f19348-dirty` | ref 85 failed to load (54 script, 31 stylesheet) |
| 2026-09-08 18:56 | cart | 1440 | 16.29% | **FAIL** | `994f19348-dirty` | ref 85 failed to load (54 script, 31 stylesheet) |
| 2026-10-15 18:01 | home | 1440 | 8.29% | PASS | `e0d1c4552-dirty` | ref 151 failed to load (111 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-15 18:03 | home | 380 | 30.26% | **FAIL** | `e0d1c4552-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-15 18:05 | home | 768 | 29.00% | **FAIL** | `e0d1c4552-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-15 18:07 | home | 1440 | 8.29% | PASS | `e0d1c4552-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-15 22:04 | home | 1440 | 8.29% | PASS | `6a23a03d2-dirty` | ref 305 failed to load (226 script, 74 font, 4 stylesheet, 1 xhr) |
| 2026-10-15 22:26 | home | 380 | 30.25% | **FAIL** | `3906e67bc-dirty` | ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-15 22:34 | home | 380 | 30.25% | **FAIL** | `3906e67bc-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-15 22:37 | home | 1440 | 9.30% | PASS | `3906e67bc-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 88 failed to load (57 script, 29 font, 1 stylesheet, 1 xhr) |
| 2026-10-15 22:39 | home | 380 | 30.24% | **FAIL** | `3906e67bc-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-16 08:46 | home | 1440 | 22.74% | **FAIL** | `080e7761c` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-16 08:48 | home | 1440 | 9.73% | PASS | `080e7761c-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-16 08:51 | home | 380 | 25.96% | **FAIL** | `080e7761c-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-16 08:53 | home | 768 | 36.34% | **FAIL** | `080e7761c-dirty` | WORSE than the 29% best known for home/768 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-16 08:53 | home | 1440 | 23.14% | **FAIL** | `080e7761c-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-16 08:55 | home | 1440 | 23.14% | **FAIL** | `080e7761c-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-16 08:57 | home | 1440 | 23.14% | **FAIL** | `080e7761c-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-17 11:17 | home | 1440 | 29.27% | **FAIL** | `8a7d637f9` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-17 21:54 | home | 1440 | n/a | **UNMEASURED** | `37b2a55e7` | screenshot failed: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3311/ Call log: [2m - navigating to "http://localhost:3311/", waiting until "domc |
| 2026-10-17 21:59 | home | 1440 | 29.27% | **FAIL** | `37b2a55e7-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-17 22:01 | home | 1440 | 29.27% | **FAIL** | `37b2a55e7-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-17 22:05 | home | 1440 | 23.91% | **FAIL** | `37b2a55e7-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-17 22:08 | home | 1440 | 29.30% | **FAIL** | `37b2a55e7-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-17 22:10 | home | 1440 | 23.91% | **FAIL** | `37b2a55e7-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-17 22:12 | home | 1440 | 23.91% | **FAIL** | `37b2a55e7-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-17 22:29 | home | 1440 | 23.91% | **FAIL** | `157ce36f2` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-17 22:33 | home | 1440 | 23.91% | **FAIL** | `157ce36f2-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-17 22:39 | home | 1440 | 23.91% | **FAIL** | `d085ddeb5-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-17 22:45 | home | 1440 | 23.91% | **FAIL** | `a8787a5d1-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-17 22:47 | home | 375 | 30.76% | **FAIL** | `a8787a5d1-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-17 22:49 | home | 414 | 33.04% | **FAIL** | `a8787a5d1-dirty` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-17 22:51 | home | 768 | 29.05% | **FAIL** | `aa0722dbe-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-18 01:34 | home | 380 | 38.69% | **FAIL** | `b0e90c099` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 21 failed to load (10 font, 4 xhr, 3 script, 3 stylesheet, 1 image) |
| 2026-10-18 01:39 | home | 380 | 39.51% | **FAIL** | `b0e90c099-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 21 failed to load (10 font, 4 xhr, 3 script, 3 stylesheet, 1 image) |
| 2026-10-18 01:42 | home | 380 | 37.44% | **FAIL** | `b0e90c099-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 21 failed to load (10 font, 4 xhr, 3 script, 3 stylesheet, 1 image) |
| 2026-10-18 01:44 | home | 768 | 34.68% | **FAIL** | `b0e90c099-dirty` | WORSE than the 29% best known for home/768 (tolerance 0.5); ref 21 failed to load (10 font, 4 xhr, 3 script, 3 stylesheet, 1 image) |
| 2026-10-18 01:46 | home | 1440 | 27.66% | **FAIL** | `b0e90c099-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 23 failed to load (12 font, 4 xhr, 3 script, 3 stylesheet, 1 image) |
| 2026-10-19 15:18 | home | 1440 | 44.94% | **FAIL** | `07b798f41` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-19 15:20 | home | 1440 | 44.94% | **FAIL** | `07b798f41-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-19 15:22 | home | 1440 | 45.37% | **FAIL** | `07b798f41-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-19 18:08 | home | 1440 | 31.77% | **FAIL** | `1592a6788` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-19 18:10 | home | 1440 | 32.07% | **FAIL** | `1592a6788-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-19 18:12 | home | 1440 | 31.77% | **FAIL** | `1592a6788-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-19 18:16 | home | 380 | 40.57% | **FAIL** | `1592a6788-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 149 failed to load (91 script, 55 font, 2 stylesheet, 1 xhr) |
| 2026-10-19 18:20 | home | 380 | 40.57% | **FAIL** | `f984ff331` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:14 | home | 1440 | 16.48% | **FAIL** | `8346a1947-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 201 failed to load (113 script, 48 image, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-20 01:16 | home | 1440 | 16.48% | **FAIL** | `8346a1947-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:18 | home | 380 | 20.46% | **FAIL** | `8346a1947-dirty` | ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:21 | home | 380 | 20.46% | **FAIL** | `8346a1947-dirty` | ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:23 | home | 380 | 20.46% | **FAIL** | `8346a1947-dirty` | ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:25 | home | 380 | 20.46% | **FAIL** | `8346a1947-dirty` | ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:27 | home | 1440 | 16.48% | **FAIL** | `8346a1947-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:29 | unknown | 1440 | 16.48% | **FAIL** | `8346a1947-dirty` |  |
| 2026-10-20 01:30 | home | 380 | 20.46% | **FAIL** | `8346a1947-dirty` | ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:33 | home | 1440 | 16.48% | **FAIL** | `8346a1947-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 201 failed to load (113 script, 48 image, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-20 01:38 | home | 1440 | 16.48% | **FAIL** | `8346a1947-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:41 | home | 1440 | 17.50% | **FAIL** | `8346a1947-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:46 | home | 1440 | 17.01% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:48 | home | 1440 | 16.16% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:50 | home | 1440 | 16.16% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:52 | home | 1440 | 15.84% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:55 | home | 1440 | 15.54% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:57 | home | 1440 | 15.24% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 01:59 | home | 1440 | 14.93% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 02:01 | home | 1440 | 14.65% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 02:03 | home | 1440 | 14.06% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 02:06 | home | 1440 | 13.53% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 02:08 | home | 1440 | 13.03% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 201 failed to load (113 script, 48 image, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-20 02:10 | home | 1440 | 12.52% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 02:12 | home | 1440 | 12.10% | **FAIL** | `817523600-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 04:23 | home | 380 | 20.46% | **FAIL** | `e7cd7178f` | ref 201 failed to load (113 script, 48 image, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-20 08:45 | home | 1440 | 63.97% | **FAIL** | `3ff82b96c` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-20 08:47 | home | 1440 | 63.97% | **FAIL** | `3ff82b96c-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 08:56 | home | 1440 | 63.97% | **FAIL** | `8e7431b9f-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 09:02 | home | 1440 | 63.97% | **FAIL** | `580ec7347-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 09:04 | home | 1440 | 27.48% | **FAIL** | `580ec7347-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 09:09 | home | 1440 | 27.48% | **FAIL** | `580ec7347-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 09:12 | home | 1440 | 27.48% | **FAIL** | `580ec7347-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 09:15 | home | 1440 | n/a | **UNMEASURED** | `580ec7347-dirty` | screenshot failed: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/ Call log: [2m - navigating to "http://localhost:3000/", waiting until "domc |
| 2026-10-20 09:16 | home | 1440 | 31.72% | **FAIL** | `580ec7347-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 09:21 | home | 1440 | 17.90% | **FAIL** | `580ec7347-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 189 failed to load (101 script, 48 image, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-20 09:25 | home | 1440 | 17.90% | **FAIL** | `945b05bde-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 09:28 | home | 1440 | 17.90% | **FAIL** | `945b05bde-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 09:31 | home | 1440 | 17.90% | **FAIL** | `945b05bde-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 144 failed to load (57 script, 48 image, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 11:11 | home | 1440 | 63.97% | **FAIL** | `446cd3105` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-20 11:13 | home | 1440 | 30.85% | **FAIL** | `446cd3105-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 11:18 | home | 1440 | 35.78% | **FAIL** | `733e890b2-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 11:22 | home | 1440 | 35.78% | **FAIL** | `be8c10640-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 11:26 | home | 1440 | 30.85% | **FAIL** | `3cda36807` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 11:26 | home | 1440 | 30.85% | **FAIL** | `3cda36807-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 11:27 | home | 1440 | n/a | **UNMEASURED** | `3cda36807-dirty` | screenshot failed: page.waitForTimeout: Target page, context or browser has been closed |
| 2026-10-20 11:28 | home | 1440 | 35.78% | **FAIL** | `3cda36807-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 11:29 | home | 1440 | 23.91% | **FAIL** | `3cda36807-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 11:31 | home | 1440 | 23.91% | **FAIL** | `3cda36807-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 11:35 | home | 1440 | 23.91% | **FAIL** | `f2a9d7f0c-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-21 08:27 | home | 1440 | 23.91% | **FAIL** | `3e4bb1859-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-22 00:28 | home | 1440 | 23.91% | **FAIL** | `a63d1c57f` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-23 05:12 | home | 1440 | 29.60% | **FAIL** | `b0feeebf8` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); baseline electro-home-v7_1440.png (frozen PNG, 2026-10-01T02:01:02.904Z), not a fresh archive sho |
| 2026-10-23 05:42 | home | 380 | 39.31% | **FAIL** | `78c37f1d6` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); baseline electro-home-v7_380.png (frozen PNG, 2026-10-01T02:01:01.055Z), not a fresh archive shot |
| 2026-10-23 05:51 | home | 380 | 36.50% | **FAIL** | `9e84c5b29-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script, 1 stylesheet (unhydrated, not a fidelity score); OURS 408px wide at 380 (o |
| 2026-10-23 05:53 | home | 380 | 36.50% | **FAIL** | `cc55b8ebb-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script, 1 stylesheet (unhydrated, not a fidelity score); OURS 408px wide at 380 (o |
| 2026-10-23 06:01 | home | 380 | 20.91% | **FAIL** | `dd0a33b48-dirty` | baseline electro-home-v7_380.png (frozen PNG, 2026-10-01T02:01:01.055Z), not a fresh archive shot |
| 2026-10-23 06:03 | home | 380 | 20.91% | **FAIL** | `dd0a33b48-dirty` | baseline electro-home-v7_380.png (frozen PNG, 2026-10-01T02:01:01.055Z), not a fresh archive shot |
| 2026-10-23 06:06 | home | 380 | 20.91% | **FAIL** | `e9e571c7e-dirty` | baseline electro-home-v7_380.png (frozen PNG, 2026-10-01T02:01:01.055Z), not a fresh archive shot |
| 2026-10-23 06:11 | home | 380 | 20.91% | **FAIL** | `873865f0f-dirty` | baseline electro-home-v7_380.png (frozen PNG, 2026-10-01T02:01:01.055Z), not a fresh archive shot |
| 2026-10-23 06:14 | home | 380 | 20.91% | **FAIL** | `8a974a4f4-dirty` | baseline electro-home-v7_380.png (frozen PNG, 2026-10-01T02:01:01.055Z), not a fresh archive shot |
| 2026-10-23 10:13 | home | 380 | n/a | **UNMEASURED** | `96c9124bd` | screenshot failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL Call log: [2m - navigating to "refs/electro-home-v7.html", waiting |
| 2026-10-23 10:14 | home | 380 | 47.35% | **FAIL** | `96c9124bd-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); baseline electro-home-v7_380.png (frozen PNG, 2026-10-23T10:12:52.766Z), not a fresh archive shot |
| 2026-10-23 10:27 | product | 380 | 53.57% | **FAIL** | `e9fd812c0` | ref 59 failed to load (40 stylesheet, 18 script, 1 xhr) |
| 2026-10-23 10:30 | product | 768 | 42.24% | **FAIL** | `e9fd812c0-dirty` | ref 59 failed to load (40 stylesheet, 18 script, 1 xhr) |
| 2026-10-23 10:32 | product | 1440 | 26.08% | **FAIL** | `e9fd812c0-dirty` | ref 59 failed to load (40 stylesheet, 18 script, 1 xhr) |
| 2026-10-23 10:33 | product | 1440 | 26.08% | **FAIL** | `e9fd812c0-dirty` | ref 59 failed to load (40 stylesheet, 18 script, 1 xhr) |
| 2026-10-23 10:44 | category | 380 | 19.41% | **FAIL** | `9d9b5d9c8` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 52 failed to load (35 font, 15 script, 1 stylesheet, 1 xhr) |
| 2026-10-23 10:46 | category | 768 | 17.87% | **FAIL** | `9d9b5d9c8-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 52 failed to load (35 font, 15 script, 1 stylesheet, 1 xhr) |
| 2026-10-23 10:48 | category | 1440 | 9.53% | PASS | `9d9b5d9c8-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 46 failed to load (29 font, 15 script, 1 stylesheet, 1 xhr) |
| 2026-10-23 11:07 | category | 380 | 19.41% | **FAIL** | `7930461c5` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 68 failed to load (35 font, 30 script, 2 stylesheet, 1 xhr) |
| 2026-10-23 11:12 | category | 380 | 19.83% | **FAIL** | `77cf18494-dirty` | OURS dropped 2 script, 1 stylesheet (unhydrated, not a fidelity score); ref 68 failed to load (35 font, 30 script, 2 stylesheet, 1 xhr) |
| 2026-10-23 11:18 | home | 1440 | 25.32% | **FAIL** | `96662ba76-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 153 failed to load (113 script, 37  |
| 2026-10-23 11:21 | category | 380 | 1.21% | PASS | `96662ba76-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline nextjs_category_380.png (frozen PNG, 2026-10-23T11:17:25.690Z), not a fresh archive shot |
| 2026-10-23 11:22 | category | 768 | 0.53% | PASS | `96662ba76-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline nextjs_category_768.png (frozen PNG, 2026-10-23T11:17:28.310Z), not a fresh archive shot |
| 2026-10-23 11:24 | category | 1440 | 0.31% | PASS | `96662ba76-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline nextjs_category_1440.png (frozen PNG, 2026-10-23T11:17:31.056Z), not a fresh archive shot |
| 2026-10-23 11:52 | cart | 380 | 39.99% | **FAIL** | `58338a806-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 168 failed to load (107 script, 61 stylesheet) |
| 2026-10-23 12:28 | account | 380 | 9.23% | PASS | `ef0ae2c08-dirty` | OURS dropped 4 script (unhydrated, not a fidelity score); baseline wayback_account_380.png (frozen PNG, 2026-10-23T12:27:11.524Z), not a fresh archive shot |
| 2026-10-23 12:30 | account | 768 | 3.71% | PASS | `ef0ae2c08-dirty` | OURS dropped 4 script (unhydrated, not a fidelity score); baseline wayback_account_768.png (frozen PNG, 2026-10-23T12:30:07.713Z), not a fresh archive shot |
| 2026-10-23 12:32 | account | 1440 | 1.99% | PASS | `ef0ae2c08-dirty` | OURS dropped 4 script (unhydrated, not a fidelity score); baseline wayback_account_1440.png (frozen PNG, 2026-10-23T12:30:25.995Z), not a fresh archive shot |
| 2026-10-23 12:36 | account | 380 | 9.23% | PASS | `9ca4a5396` | OURS dropped 4 script (unhydrated, not a fidelity score); baseline wayback_account_380.png (frozen PNG, 2026-10-23T12:27:11.524Z), not a fresh archive shot |
| 2026-10-23 12:38 | account | 768 | 3.71% | PASS | `9ca4a5396-dirty` | OURS dropped 4 script (unhydrated, not a fidelity score); baseline wayback_account_768.png (frozen PNG, 2026-10-23T12:30:07.713Z), not a fresh archive shot |
| 2026-10-23 12:39 | account | 1440 | 1.99% | PASS | `9ca4a5396-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline wayback_account_1440.png (frozen PNG, 2026-10-23T12:30:25.995Z), not a fresh archive shot |
| 2026-10-23 12:41 | account | 380 | 9.23% | PASS | `9ca4a5396-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline wayback_account_380.png (frozen PNG, 2026-10-23T12:27:11.524Z), not a fresh archive shot |
| 2026-10-23 12:43 | account | 768 | 3.71% | PASS | `9ca4a5396-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline wayback_account_768.png (frozen PNG, 2026-10-23T12:30:07.713Z), not a fresh archive shot |
| 2026-10-23 12:44 | account | 1440 | 1.99% | PASS | `9ca4a5396-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline wayback_account_1440.png (frozen PNG, 2026-10-23T12:30:25.995Z), not a fresh archive shot |
| 2026-10-23 13:03 | supplier | 380 | 0.81% | PASS | `e8a0628d6-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline nextjs_supplier_380.png (frozen PNG, 2026-10-23T13:02:24.085Z), not a fresh archive shot |
| 2026-10-23 13:05 | supplier | 768 | 0.40% | PASS | `e8a0628d6-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline nextjs_supplier_768.png (frozen PNG, 2026-10-23T13:02:26.832Z), not a fresh archive shot |
| 2026-10-23 13:07 | supplier | 1440 | 0.21% | PASS | `e8a0628d6-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline nextjs_supplier_1440.png (frozen PNG, 2026-10-23T13:02:29.622Z), not a fresh archive shot |
| 2026-10-23 13:08 | supplier | 768 | 0.40% | PASS | `e8a0628d6-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline nextjs_supplier_768.png (frozen PNG, 2026-10-23T13:02:26.832Z), not a fresh archive shot |
| 2026-10-23 13:10 | supplier | 1440 | 0.21% | PASS | `e8a0628d6-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); baseline nextjs_supplier_1440.png (frozen PNG, 2026-10-23T13:02:29.622Z), not a fresh archive shot |
| 2026-10-25 16:56 | home | 380 | 50.62% | **FAIL** | `91f5a0b64` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-25 20:18 | home | 380 | 50.62% | **FAIL** | `a34890a53` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-25 20:20 | home | 380 | 50.62% | **FAIL** | `a34890a53-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-25 22:55 | home | 1440 | 8.09% | PASS | `189d01677` | ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-25 22:57 | home | 380 | 50.62% | **FAIL** | `189d01677-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-25 23:00 | home | 380 | 50.63% | **FAIL** | `189d01677-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 fo |
| 2026-10-25 23:02 | home | 380 | 50.62% | **FAIL** | `189d01677-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-25 23:32 | category | 380 | 19.31% | **FAIL** | `25a3b8068` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 52 failed to load (35 font, 15 script, 1 stylesheet, 1 xhr) |
| 2026-10-25 23:34 | category | 768 | 16.82% | **FAIL** | `25a3b8068-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 52 failed to load (35 font, 15 script, 1 stylesheet, 1 xhr) |
| 2026-10-25 23:36 | category | 1440 | 5.68% | PASS | `25a3b8068-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 46 failed to load (29 font, 15 script, 1 stylesheet, 1 xhr) |
| 2026-10-25 23:38 | category | 1440 | 5.68% | PASS | `0d364d6a5` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 46 failed to load (29 font, 15 script, 1 stylesheet, 1 xhr) |
| 2026-10-26 00:03 | home | 380 | 39.54% | **FAIL** | `6d1529532-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 6 script, 1 stylesheet (unhydrated, not a fidelity score); OURS 412px wide at 380 (o |
| 2026-10-26 00:09 | home | 380 | 39.54% | **FAIL** | `6d1529532-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 6 script, 1 stylesheet (unhydrated, not a fidelity score); OURS 412px wide at 380 (o |
| 2026-10-26 02:17 | home | 1440 | n/a | **UNMEASURED** | `ec0c16a57` | screenshot failed: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3001/ Call log: [2m - navigating to "http://localhost:3001/", waiting until "domc |
| 2026-10-26 02:18 | home | 380 | 12.83% | **FAIL** | `ec0c16a57-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-26 02:22 | home | 380 | n/a | **UNMEASURED** | `22d6a794a-dirty` | screenshot failed: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3001/ Call log: [2m - navigating to "http://localhost:3001/", waiting until "domc |
| 2026-10-26 02:23 | home | 380 | 51.38% | **FAIL** | `22d6a794a-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 fo |
| 2026-10-26 02:25 | home | 380 | 50.62% | **FAIL** | `22d6a794a-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 153 failed to load (113 script, 37  |
| 2026-10-26 04:26 | home | 380 | 50.62% | **FAIL** | `cf93912ee` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 04:29 | home | 380 | 50.62% | **FAIL** | `64e78cda6-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-26 04:57 | home | 380 | 50.62% | **FAIL** | `4ff21a431` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 05:02 | home | 380 | 56.58% | **FAIL** | `4ff21a431-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 05:43 | home | 380 | 50.62% | **FAIL** | `6ad7edbb2-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 05:46 | home | 380 | 50.62% | **FAIL** | `6ad7edbb2-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 05:49 | home | 380 | 61.48% | **FAIL** | `6ad7edbb2-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 09:53 | home | 380 | 61.49% | **FAIL** | `bfe283d9f` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-26 09:55 | home | 380 | 61.49% | **FAIL** | `bfe283d9f-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-26 11:44 | home | 1440 | 30.23% | **FAIL** | `0c95bf04e` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 12:47 | home | 1440 | 5.80% | PASS | `36f726c97` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 154 failed to load (113 script, 37 font, 2 stylesheet, 1 image, 1 xhr) |
| 2026-10-26 12:48 | home | 1440 | 5.80% | PASS | `36f726c97-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 12:49 | home | 1440 | 5.80% | PASS | `36f726c97-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 12:51 | home | 380 | 12.83% | **FAIL** | `36f726c97-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 12:53 | home | 768 | 13.80% | **FAIL** | `4afebe3e5-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 12:55 | home | 1440 | 5.80% | PASS | `4afebe3e5-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 13:37 | home | 380 | 61.49% | **FAIL** | `78faad8e8` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 141 failed to load (101 script, 37  |
| 2026-10-26 14:55 | home | 380 | 61.49% | **FAIL** | `a7a7c1129` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 153 failed to load (113 script, 37  |
| 2026-10-26 15:01 | home | 380 | 61.49% | **FAIL** | `db6a0b39a` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 153 failed to load (113 script, 37  |
| 2026-10-26 15:49 | home | 380 | 61.49% | **FAIL** | `95a8c6a9b` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 153 failed to load (113 script, 37  |
| 2026-10-26 16:29 | home | 1440 | 30.23% | **FAIL** | `83d7a77ea` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 16:30 | home | 1440 | 30.23% | **FAIL** | `83d7a77ea-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-26 16:58 | category | 380 | n/a | **UNMEASURED** | `58cd24948` | screenshot failed: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/hot-deals Call log: [2m - navigating to "http://localhost:3000/cate |
| 2026-10-26 16:58 | category | 768 | n/a | **UNMEASURED** | `02cdd39fa-dirty` | screenshot failed: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/category/hot-deals Call log: [2m - navigating to "http://localhost:3000/cate |
| 2026-10-26 17:02 | category | 380 | 15.93% | **FAIL** | `02cdd39fa-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 68 failed to load (35 font, 30 script, 2 stylesheet, 1 xhr) |
| 2026-10-26 17:03 | category | 768 | 15.94% | **FAIL** | `02cdd39fa-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 68 failed to load (35 font, 30 script, 2 stylesheet, 1 xhr) |
| 2026-10-26 17:05 | category | 1440 | 9.42% | PASS | `02cdd39fa-dirty` | OURS dropped 2 script (unhydrated, not a fidelity score); ref 62 failed to load (30 script, 29 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 17:38 | home | 1440 | 30.23% | **FAIL** | `da1279b86` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 145 failed to load (105 script, 37  |
| 2026-10-26 17:43 | home | 380 | 61.49% | **FAIL** | `cda7038f2-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 fo |
| 2026-10-26 17:45 | home | 768 | 39.45% | **FAIL** | `cda7038f2-dirty` | WORSE than the 29% best known for home/768 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 font, |
| 2026-10-26 17:45 | home | 1440 | 30.23% | **FAIL** | `cda7038f2-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-26 17:46 | home | 1440 | 30.23% | **FAIL** | `cda7038f2-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 153 failed to load (113 script, 37  |
| 2026-10-26 17:53 | home | 380 | 61.49% | **FAIL** | `76fed6ab0` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 fo |
| 2026-10-26 17:55 | home | 380 | 61.49% | **FAIL** | `76fed6ab0-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 fo |
| 2026-10-26 17:57 | home | 768 | 39.45% | **FAIL** | `76fed6ab0-dirty` | WORSE than the 29% best known for home/768 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 font, |
| 2026-10-26 18:08 | home | 380 | 61.49% | **FAIL** | `5835df3f2-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 142 failed to load (102 script, 37  |
| 2026-10-26 18:09 | home | 380 | 49.56% | **FAIL** | `5835df3f2-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 fo |
| 2026-10-26 18:11 | home | 768 | 39.44% | **FAIL** | `5835df3f2-dirty` | WORSE than the 29% best known for home/768 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 font, |
| 2026-10-26 18:11 | home | 380 | 61.49% | **FAIL** | `5835df3f2-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 fo |
| 2026-10-26 18:12 | home | 1440 | 30.23% | **FAIL** | `5835df3f2-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 fo |
| 2026-10-26 18:12 | home | 768 | 39.45% | **FAIL** | `5835df3f2-dirty` | WORSE than the 29% best known for home/768 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 font, |
| 2026-10-26 18:19 | home | 380 | 61.49% | **FAIL** | `30bdcd927` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 fo |
| 2026-10-26 18:21 | home | 768 | 39.45% | **FAIL** | `30bdcd927-dirty` | WORSE than the 29% best known for home/768 (tolerance 0.5); OURS dropped 2 script (unhydrated, not a fidelity score); ref 96 failed to load (57 script, 37 font, |
| 2026-10-26 18:23 | home | 1440 | n/a | **UNMEASURED** | `30bdcd927-dirty` | screenshot failed: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3311/ Call log: [2m - navigating to "http://localhost:3311/", waiting until "domc |
| 2026-10-27 11:01 | home | 380 | 61.48% | **FAIL** | `30bdcd927-dirty` | WORSE than the 30.26% best known for home/380 (tolerance 0.5); ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
