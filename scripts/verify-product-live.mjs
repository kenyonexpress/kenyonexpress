// Proves, end to end against production, that the product page's live
// channel (migration 235) delivers -- because its failure mode is silence:
// a broadcast topic nobody sends on, a `realtime.messages` table with no
// partition for today, or a Realtime tenant that is asleep all look, from the
// browser, exactly like a product nobody is buying. The 2026-09-16 dry-run
// of 235 measured the partition case: `realtime.send` swallowed "no partition
// of relation messages found for row" and the UPDATE succeeded anyway.
//
// WHAT IT DOES
//
//   1. Subscribes with the anon key to `product:<id>` for the `live` event,
//      exactly like src/lib/product-live/use-product-live.ts does.
//   2. Prints `SUBSCRIBED` and waits. The operator (or the session driving
//      this) then fires the trigger -- any UPDATE of stock_quantity on that
//      product, or a direct `select realtime.send(...)` on the topic through
//      MCP -- and Realtime must deliver it here.
//   3. Validates the payload with the same shape rule the page applies and
//      prints `PASS` with the six fields, exit 0. Nothing after the deadline:
//      `TIMEOUT`, exit 1.
//
// Run: node scripts/verify-product-live.mjs <product-uuid> [seconds=90]

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function envFromDotLocal() {
  const out = {}
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(
      '\n',
    )) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) out[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {
    /* fall through to process.env */
  }
  return out
}

const dotenv = envFromDotLocal()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? dotenv.NEXT_PUBLIC_SUPABASE_URL
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  dotenv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  dotenv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const [productId, secondsArg] = process.argv.slice(2)
const seconds = Number(secondsArg ?? 90)

if (!url || !anonKey || !productId) {
  console.error('usage: node scripts/verify-product-live.mjs <product-uuid> [seconds]')
  console.error('needs NEXT_PUBLIC_SUPABASE_URL and the anon/publishable key in env or .env.local')
  process.exit(2)
}

// Same rule as parseProductLiveEvent, restated in plain JS so this file runs
// without a build. If the two drift, the page and this proof disagree, which
// is itself the finding.
function parse(raw) {
  if (typeof raw !== 'object' || raw === null) return null
  if (typeof raw.product_id !== 'string' || typeof raw.status !== 'string') return null
  if (!('stock_quantity' in raw) || !('kenyon_price' in raw)) return null
  return raw
}

const supabase = createClient(url, anonKey)
const topic = `product:${productId}`
const startedAt = Date.now()

const timer = setTimeout(() => {
  console.log(`TIMEOUT after ${seconds}s on ${topic}: nothing delivered`)
  process.exit(1)
}, seconds * 1000)

const channel = supabase
  .channel(topic)
  .on('broadcast', { event: 'live' }, (message) => {
    const event = parse(message.payload)
    if (!event) {
      console.log('RECEIVED but refused by the shape rule:', JSON.stringify(message.payload))
      return
    }
    if (event.product_id !== productId) {
      console.log('RECEIVED for another product, ignored:', event.product_id)
      return
    }
    clearTimeout(timer)
    console.log(
      `PASS ${Date.now() - startedAt}ms stock=${event.stock_quantity} available=${event.available} price=${event.kenyon_price} full=${event.full_price} status=${event.status}`,
    )
    void supabase.removeChannel(channel).then(() => process.exit(0))
  })
  .subscribe((status, err) => {
    console.log(status + (err ? ` ${err.message}` : ''))
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      clearTimeout(timer)
      process.exit(1)
    }
  })
