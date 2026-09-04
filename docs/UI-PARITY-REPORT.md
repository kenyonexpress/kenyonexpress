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
