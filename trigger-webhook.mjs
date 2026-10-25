// Test the actual webhook handler with production data
const WEBHOOK_URL = 'https://kenyonexpress.co.il/api/webhooks/order-paid'
const ORDER_ID = 'd3a5aa99-ed75-4bf4-8dfa-ad0035be848c' // Real paid order from production

console.log('Calling webhook handler:', WEBHOOK_URL)
console.log('With order ID:', ORDER_ID)

const response = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId: ORDER_ID }),
})

const result = await response.json()
console.log('Response status:', response.status)
console.log('Response:', JSON.stringify(result, null, 2))

if (result.ok && result.notified) {
  console.log('\n✓ Webhook handler successfully triggered alert for real paid order')
} else if (result.skipped) {
  console.log('\n⚠ Order status check:', result.reason)
} else {
  console.error('\n✗ Webhook call failed')
  process.exit(1)
}
