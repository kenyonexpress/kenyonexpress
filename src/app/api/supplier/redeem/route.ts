/**
 * Canonical path in ARCHITECTURE-SUPPLIER-PORTAL.md.
 * Implementation lives under /api/supplier/vouchers/redeem; this alias keeps
 * offline drain and docs aligned without duplicating logic. The runtime is
 * declared locally so the segment config is statically analyzable.
 */
export const runtime = 'nodejs'

export { POST } from '@/app/api/supplier/vouchers/redeem/route'
