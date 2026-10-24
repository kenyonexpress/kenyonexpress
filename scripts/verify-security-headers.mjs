#!/usr/bin/env node
/**
 * Verify that security headers are correctly set with CSP nonce.
 *
 * This script starts a local server, makes a request to get the headers,
 * and verifies that all required headers for an A+ rating are present.
 *
 * Usage: node scripts/verify-security-headers.mjs
 */

import { spawn } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'

const PORT = 3311
const BASE_URL = `http://localhost:${PORT}`

/**
 * Start the Next.js server
 */
function startServer() {
  const server = spawn('pnpm', ['start'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return new Promise((resolve, reject) => {
    server.stdout.on('data', (data) => {
      const output = data.toString()
      if (output.includes('Ready')) {
        resolve(server)
      }
    })

    server.stderr.on('data', (data) => {
      const output = data.toString()
      if (output.includes('EADDRINUSE')) {
        reject(new Error(`Port ${PORT} is already in use`))
      }
    })

    // Timeout after 30 seconds
    const timeout = globalThis.setTimeout(() => {
      reject(new Error('Server failed to start within timeout'))
    }, 30000)

    server.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

/**
 * Fetch headers from the server
 */
async function fetchHeaders(path = '/') {
  const response = await fetch(`${BASE_URL}${path}`)
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  }
}

/**
 * Verify security headers
 */
function verifyHeaders(headers) {
  const results = {
    passed: [],
    failed: [],
  }

  // Required headers for A+ rating
  const requiredHeaders = {
    'content-security-policy': (value) => {
      // Should contain nonce and not contain unsafe-inline
      if (!value) return 'Missing CSP header'
      if (value.includes("'unsafe-inline'")) return 'CSP contains unsafe-inline'
      if (!value.includes("'nonce-")) return 'CSP missing nonce directive'
      if (!value.includes("'strict-dynamic'")) return 'CSP missing strict-dynamic'
      if (!value.includes("frame-ancestors 'none'")) return 'CSP missing frame-ancestors'
      return true
    },
    'x-frame-options': (value) => {
      if (!value) return 'Missing X-Frame-Options'
      if (value !== 'DENY' && value !== 'SAMEORIGIN') {
        return `Invalid X-Frame-Options: ${value}`
      }
      return true
    },
    'x-content-type-options': (value) => {
      if (!value) return 'Missing X-Content-Type-Options'
      if (value !== 'nosniff') return `Expected nosniff, got: ${value}`
      return true
    },
    'referrer-policy': (value) => {
      if (!value) return 'Missing Referrer-Policy'
      if (value !== 'strict-origin-when-cross-origin') {
        return `Expected strict-origin-when-cross-origin, got: ${value}`
      }
      return true
    },
    'permissions-policy': (value) => {
      if (!value) return 'Missing Permissions-Policy'
      return true
    },
    'strict-transport-security': (value) => {
      if (!value) return 'Missing Strict-Transport-Security'
      if (!value.includes('max-age=')) return 'HSTS missing max-age'
      return true
    },
  }

  for (const [header, validator] of Object.entries(requiredHeaders)) {
    const value = headers[header]
    const result = validator(value)
    if (result === true) {
      results.passed.push({ header, value })
    } else {
      results.failed.push({ header, error: result, value })
    }
  }

  return results
}

/**
 * Main function
 */
async function main() {
  console.log('🔒 Security Headers Verification\n')

  // Check if server is already running
  let server = null
  let ownServer = false

  try {
    console.log(`Testing connection to ${BASE_URL}...`)
    await fetchHeaders()
    console.log('✓ Server already running\n')
  } catch {
    console.log('Starting local server...')
    server = await startServer()
    ownServer = true
    // Wait for server to be fully ready
    await setTimeout(2000)
    console.log('✓ Server started\n')
  }

  try {
    // Test home page
    console.log('Testing home page headers...')
    const { status, headers } = await fetchHeaders('/')
    console.log(`Status: ${status}\n`)

    const results = verifyHeaders(headers)

    console.log('✅ Passed headers:')
    for (const { header, value } of results.passed) {
      console.log(`  ${header}: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`)
    }

    if (results.failed.length > 0) {
      console.log('\n❌ Failed headers:')
      for (const { header, error, value } of results.failed) {
        console.log(`  ${header}: ${error}`)
        if (value) {
          console.log(
            `    Current value: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`,
          )
        }
      }
      process.exit(1)
    }

    // Extract and display the nonce
    const csp = headers['content-security-policy']
    const nonceMatch = csp?.match(/'nonce-([^']+)'/)
    if (nonceMatch) {
      console.log(`\n🔑 CSP Nonce: ${nonceMatch[1]}`)
    }

    console.log('\n✅ All security headers verified!')
    console.log('✅ Configuration should achieve A+ on securityheaders.com')
  } finally {
    if (ownServer && server) {
      console.log('\nStopping server...')
      server.kill('SIGTERM')
      await setTimeout(1000)
    }
  }
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})
