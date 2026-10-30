// Prints a fresh VAPID key pair in .env format. Never writes a file: paste the
// two lines into .env.local and the hosting env yourself.
//   node scripts/gen-vapid.mjs
import webpush from 'web-push'

const { publicKey, privateKey } = webpush.generateVAPIDKeys()
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
