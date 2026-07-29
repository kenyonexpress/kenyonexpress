# KenyonExpress State (ke-arch-pwa)

## Current Phase
PWA architecture (`arch/pwa`).

## Last Completed
2026-07-30: `docs/ARCHITECTURE-PWA.md` (docs only):

- `manifest.ts` with theme/background `#fed700`, Hebrew RTL, icons, shortcuts
- Serwist SW (not `next-pwa`): NetworkOnly private routes, NetworkFirst pages, CacheFirst product images
- Offline fallback `/offline`
- Add to Home Screen prompt (Android BIP + iOS help)
- Push future: replace WP OneSignal with first-party Web Push + `push_subscriptions`
- Full TypeScript

## In Progress
nothing

## Blocking Issues
none for this docs pass

## Next Task
Implement PWA-1 on storefront: icons export, Serwist, offline page, A2HS.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-arch-pwa

## Branch
`arch/pwa`

## History

### 2026-07-30
Created worktree from `origin/main` (`3babc98`), wrote binding PWA architecture, commit message `PWA architecture`.
