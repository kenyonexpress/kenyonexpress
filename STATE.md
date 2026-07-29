# KenyonExpress State (ke-arch-performance)

## Current Phase
Performance architecture (`arch/performance`).

## Last Completed
2026-07-30: `docs/ARCHITECTURE-PERFORMANCE.md` (docs only):

- ISR/SSG per page type (home 120s, category 300s, product 120s) + revalidate tags
- next/image exact sizes/quality table + full components
- Heebo preload (400/700, next/font)
- Bundle analysis budgets + analyzer wiring
- Supabase column-select + catalog indexes + sort_price_agorot
- Vercel Edge Cache-Control + cookie fragmentation rules
- Numeric Core Web Vitals targets (field + lab) + CI assert sketch
- Full TypeScript

## In Progress
nothing

## Blocking Issues
none for this docs pass

## Next Task
Wire ISR tags + image sizes on storefront branch (`phase5/homepage` or feat/perf).

## Working Directory
/Users/ofir/kenyonexpress-web/ke-arch-performance

## Branch
`arch/performance`

## History

### 2026-07-30
Created worktree from `origin/main` (`3babc98`), wrote binding performance architecture, commit message `Performance architecture`.
