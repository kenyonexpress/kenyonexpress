#!/usr/bin/env node

// Set up environment for mock provider
process.env.CARDCOM_USE_MOCK = 'true'
process.env.CARDCOM_TERMINAL_NUMBER = 'test-term'
process.env.CARDCOM_API_NAME = 'test-api'
process.env.CARDCOM_API_PASSWORD = 'test-pass'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

console.log('🔄 Starting C29 live flow verification...\n')

// Import real modules
const { startSupplierCardVerification, completeSupplierCardVerification } = await import(
  '../src/server/supplier/card-verification.js'
)
const { supplierAgreementHash, SUPPLIER_AGREEMENT_VERSION } = await import(
  '../src/lib/legal/supplier-agreement.js'
)
const { createAdminClient } = await import('../src/lib/supabase/admin.js')

const admin = createAdminClient()
const testEmail = `c29-verify-${Date.now()}@test.local`

const payload = {
  business_name: 'C29 Verification Business',
  contact_name: 'C29 Test',
  email: testEmail,
  phone: '+972501234567',
  city: 'Test City',
  category: 'Test',
  website: 'https://test.example.com',
  message: 'C29 live flow test',
  agreement_hash: supplierAgreementHash(),
}

let verificationId = null
let leadId = null

try {
  // Step 1: Start card verification with REAL code
  console.log('Step 1: Starting card verification...')
  const result = await startSupplierCardVerification({
    payload,
    ip: '203.0.113.100',
    userAgent: 'C29-Verification/1.0',
  })

  if (result.kind !== 'done' || result.status !== 'verified') {
    throw new Error(`Verification failed: ${JSON.stringify(result)}`)
  }
  console.log('✓ Card verification started and completed (mock provider)')

  // Step 2: Query the verification row
  console.log('\nStep 2: Querying verification row from database...')
  const { data: verification, error: verifyError } = await admin
    .from('supplier_card_verifications')
    .select('id, amount_agorot, status, voided, ip_address, user_agent')
    .eq('email', testEmail)
    .single()

  if (verifyError) throw verifyError
  verificationId = verification.id

  console.log('✓ Verification row retrieved:')
  console.log(`  Amount: ${verification.amount_agorot} agorot`)
  console.log(`  Status: ${verification.status}`)
  console.log(`  Voided: ${verification.voided}`)
  console.log(`  IP: ${verification.ip_address}`)
  console.log(`  User Agent: ${verification.user_agent}`)

  if (verification.amount_agorot !== 100) {
    throw new Error(`Expected 100 agorot, got ${verification.amount_agorot}`)
  }

  // Step 3: Complete verification (this calls createSupplierLead)
  console.log('\nStep 3: Completing verification (calls createSupplierLead)...')
  const status = await completeSupplierCardVerification(verificationId)

  if (status !== 'verified') {
    throw new Error(`Complete failed: ${status}`)
  }
  console.log('✓ Verification completed')

  // Step 4: Query supplier_lead
  console.log('\nStep 4: Querying supplier_lead...')
  const { data: lead, error: leadError } = await admin
    .from('supplier_leads')
    .select('id, email, business_name')
    .eq('email', testEmail)
    .single()

  if (leadError) throw leadError
  leadId = lead.id
  console.log('✓ Supplier lead created:', lead.id)

  // Step 5: Query supplier_agreements row (THE CRITICAL VERIFICATION)
  console.log('\nStep 5: Querying supplier_agreements...')
  const { data: agreement, error: agreementError } = await admin
    .from('supplier_agreements')
    .select('*')
    .eq('supplier_lead_id', leadId)
    .single()

  if (agreementError) throw agreementError

  console.log('✓ supplier_agreements row found:')
  console.log(`  ID: ${agreement.id}`)
  console.log(`  Supplier Lead ID: ${agreement.supplier_lead_id}`)
  console.log(`  Verification ID: ${agreement.verification_id}`)
  console.log(`  Version Hash: ${agreement.version_hash.substring(0, 16)}...`)
  console.log(`  Version Date: ${agreement.version_date}`)
  console.log(`  IP Address: ${agreement.ip_address}`)
  console.log(`  User Agent: ${agreement.user_agent}`)
  console.log(`  Created At: ${agreement.created_at}`)

  // Verify all fields
  const errors = []
  if (agreement.version_hash !== supplierAgreementHash()) {
    errors.push('version_hash mismatch')
  }
  if (agreement.version_date !== SUPPLIER_AGREEMENT_VERSION) {
    errors.push('version_date mismatch')
  }
  if (agreement.ip_address !== '203.0.113.100') {
    errors.push('ip_address mismatch')
  }
  if (agreement.user_agent !== 'C29-Verification/1.0') {
    errors.push('user_agent mismatch')
  }
  if (!agreement.created_at) {
    errors.push('created_at missing')
  }
  if (agreement.supplier_lead_id !== leadId) {
    errors.push('supplier_lead_id mismatch')
  }
  if (agreement.verification_id !== verificationId) {
    errors.push('verification_id mismatch')
  }

  if (errors.length > 0) {
    throw new Error(`Field verification failed: ${errors.join(', ')}`)
  }

  console.log('\n✅ SUCCESS: All C29 requirements verified:')
  console.log('  ✓ 100 agorot (₪1) charge processed (mock provider)')
  console.log('  ✓ supplier_agreements row written by createSupplierLead')
  console.log('  ✓ version_hash recorded correctly')
  console.log('  ✓ version_date recorded correctly')
  console.log('  ✓ ip_address recorded correctly')
  console.log('  ✓ user_agent recorded correctly')
  console.log('  ✓ created_at timestamp present')
  console.log('  ✓ Links to supplier_lead and verification')
} finally {
  // Cleanup
  console.log('\n🧹 Cleaning up test data...')
  if (leadId) {
    await admin.from('supplier_agreements').delete().eq('supplier_lead_id', leadId)
    await admin.from('supplier_leads').delete().eq('id', leadId)
  }
  if (verificationId) {
    await admin.from('supplier_card_tokens').delete().eq('verification_id', verificationId)
    await admin.from('supplier_card_verifications').delete().eq('id', verificationId)
  }
  console.log('✓ Cleanup complete')
}
