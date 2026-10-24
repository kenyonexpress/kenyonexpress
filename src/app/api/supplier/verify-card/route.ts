/**
 * Supplier-facing alias of the 1 ILS card verification stub. Same handler and
 * same gate: CARD_VERIFY_STUB_ENABLED=true, otherwise 404. Charges nothing.
 */
export { POST } from '@/app/api/payments/verify-card-stub/route'
