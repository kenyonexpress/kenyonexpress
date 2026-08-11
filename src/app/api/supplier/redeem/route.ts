/**
 * Canonical path in ARCHITECTURE-SUPPLIER-PORTAL.md.
 * Implementation lives under /api/supplier/vouchers/redeem; this alias keeps
 * offline drain and docs aligned without duplicating logic.
 */
// The portal branch wrote `export { POST, runtime }`. There is no `runtime` to
// re-export -- the implementation declares none -- and it could not have worked
// anyway: a route segment config must be a literal in its own segment, Next
// reads it statically and does not follow a re-export. Declaring one here
// instead fails the build outright, because `cacheComponents` rejects `runtime`
// the same way it rejects `dynamic`. So the alias re-exports the handler and
// nothing else, which is what an alias is.
export { POST } from '@/app/api/supplier/vouchers/redeem/route'
