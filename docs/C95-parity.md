# C95 parity re-check (2026-10-30)

Command: `pnpm run compare -- --widths=380,768,1440` (positional widths are ignored by compare.mjs; `--widths=` is the real flag).

## Run A: against whatever answers on :3000
That server was a different checkout (`ke-goals/ke-autopilot-v2/repo`), so these numbers do NOT measure this repo.
380 = 12.83%, 768 = 13.80%, 1440 = 5.80%.

## Run B: this repo, `next build` + `next start -p 3100`
- 380: 43.32% FAIL. Ours is 5463px tall vs live 18146. The hero renders blank (HeroMobile/hero area, locked) and the category row and feature bar are missing at 380.
- 768, 1440: not scored. compare.mjs refused three times ("8 image(s) on the local page had still not loaded").

## Result
No page-level CSS fix reaches the gate. The 380 gap comes from the blank hero (locked components). 768 and 1440 could not be measured on this repo's build.
Gate NOT passed: 380 = 43.32%.

RESULT: BLOCKED locked-component C95 (home hero blank at 380; 768/1440 unmeasurable on own build)
