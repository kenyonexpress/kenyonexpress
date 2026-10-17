/**
 * Real cost measurement from vendor APIs
 * Fetches actual spending data from Supabase, Vercel, and other providers
 */

import https from 'node:https'

function makeHttpsRequest(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data))
            } catch (e) {
              reject(new Error(`Failed to parse JSON: ${e.message}`))
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}`))
          }
        })
      })
      .on('error', reject)
  })
}

/**
 * Fetch Supabase project details and billing information
 * Requires SUPABASE_CLI_KEYCHAIN_TOKEN in environment
 * Returns: { plan, pitr_enabled, compute_instance }
 */
export async function fetchSupabaseCosts() {
  const token = process.env.SUPABASE_CLI_KEYCHAIN_TOKEN
  const projectId = 'ixvwfbuvfxxsjiywhbbb' // Production project

  if (!token) {
    console.warn('⚠️  SUPABASE_CLI_KEYCHAIN_TOKEN not set — using hardcoded Pro ($25/mo)')
    return {
      plan: 'pro',
      monthly: 25,
      pitr_enabled: false,
      pitr_cost: 0,
      source: 'hardcoded',
    }
  }

  try {
    // Fetch project plan via management API
    const projectUrl = `https://api.supabase.io/v1/projects/${projectId}?apikey=${token}`
    const projectData = await makeHttpsRequest(projectUrl)

    // Fetch billing add-ons
    const billingUrl = `https://api.supabase.io/v1/projects/${projectId}/billing/addons?apikey=${token}`
    const billingData = await makeHttpsRequest(billingUrl)

    // Map plan to cost
    const planCosts = {
      free: 0,
      pro: 25,
      team: 599,
      enterprise: 0, // Custom pricing
    }

    const baseCost = planCosts[projectData.plan || 'pro'] || 25
    let pitrCost = 0

    // Check for PITR add-ons
    if (billingData.selected_addons) {
      if (billingData.selected_addons.includes('pitr_7')) {
        pitrCost += 100 // 7-day retention
      }
      if (billingData.selected_addons.includes('ci_small')) {
        pitrCost += 15 // Small compute upgrade for PITR
      }
    }

    return {
      plan: projectData.plan || 'pro',
      monthly: baseCost,
      pitr_enabled: pitrCost > 0,
      pitr_cost: pitrCost,
      total: baseCost + pitrCost,
      source: 'measured',
    }
  } catch (err) {
    console.warn(`⚠️  Failed to fetch Supabase costs: ${err.message}`)
    return {
      plan: 'pro',
      monthly: 25,
      pitr_enabled: false,
      pitr_cost: 0,
      source: 'fallback',
    }
  }
}

/**
 * Fetch Vercel project billing information
 * Requires VERCEL_TOKEN in environment
 * Returns: { plan, monthly }
 */
export async function fetchVercelCosts() {
  const token = process.env.VERCEL_TOKEN

  if (!token) {
    console.warn('⚠️  VERCEL_TOKEN not set — using hardcoded Pro ($33/mo)')
    return {
      plan: 'pro',
      monthly: 33,
      source: 'hardcoded',
    }
  }

  try {
    // Fetch teams/accounts
    const teamsUrl = 'https://api.vercel.com/v2/teams?limit=1'
    const teamsData = await makeHttpsRequest(teamsUrl)
    const teamId = teamsData.teams?.[0]?.id

    if (!teamId) {
      return {
        plan: 'pro',
        monthly: 33,
        source: 'fallback',
      }
    }

    // Fetch billing for team
    const billingUrl = `https://api.vercel.com/v1/teams/${teamId}/billing?teamId=${teamId}`
    const billingData = await makeHttpsRequest(billingUrl)

    // Map Vercel plans to costs
    const planCosts = {
      pro: 20,
      team: 150,
      enterprise: 0, // Custom pricing
    }

    const baseCost = planCosts[billingData.plan] || 20
    const analyticsCost = billingData.analyticsEnabled ? 13 : 0

    return {
      plan: billingData.plan || 'pro',
      base: baseCost,
      analytics: analyticsCost,
      monthly: baseCost + analyticsCost,
      source: 'measured',
    }
  } catch (err) {
    console.warn(`⚠️  Failed to fetch Vercel costs: ${err.message}`)
    return {
      plan: 'pro',
      monthly: 33,
      source: 'fallback',
    }
  }
}

/**
 * Fetch R2 bucket usage and costs
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in environment
 * Returns: { storage_gb, monthly_cost }
 */
export async function fetchR2Costs() {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID

  if (!token || !accountId) {
    console.warn('⚠️  CLOUDFLARE credentials not set — using hardcoded ($0/mo free tier)')
    return {
      storage_gb: 0,
      monthly_cost: 0,
      source: 'hardcoded',
    }
  }

  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`
    const bucketsData = await makeHttpsRequest(url)

    let totalStorage = 0
    if (bucketsData.result) {
      for (const bucket of bucketsData.result) {
        totalStorage += bucket.size_bytes || 0
      }
    }

    const storageTb = totalStorage / (1024 * 1024 * 1024 * 1024)
    const overage = Math.max(0, storageTb - 10) // First 10GB free
    const monthlyCost = overage * 15 // $15 per TB overage

    return {
      storage_gb: totalStorage / (1024 * 1024 * 1024),
      monthly_cost: monthlyCost,
      source: 'measured',
    }
  } catch (err) {
    console.warn(`⚠️  Failed to fetch R2 costs: ${err.message}`)
    return {
      storage_gb: 0,
      monthly_cost: 0,
      source: 'fallback',
    }
  }
}

/**
 * Fetch Resend email API usage
 * Requires RESEND_API_KEY in environment
 * Returns: { emails_sent, monthly_cost }
 */
export async function fetchResendCosts() {
  const token = process.env.RESEND_API_KEY

  if (!token) {
    console.warn('⚠️  RESEND_API_KEY not set — using estimate (10k emails = $1)')
    return {
      emails_sent: 10000,
      monthly_cost: 1.0,
      source: 'estimated',
    }
  }

  try {
    // Resend doesn't expose usage metrics directly via API
    // This would require custom tracking or checking dashboard
    return {
      emails_sent: 10000,
      monthly_cost: 1.0,
      source: 'hardcoded-api',
    }
  } catch (err) {
    console.warn(`⚠️  Failed to fetch Resend costs: ${err.message}`)
    return {
      emails_sent: 10000,
      monthly_cost: 1.0,
      source: 'fallback',
    }
  }
}

/**
 * Fetch Twilio SMS usage and costs
 * Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in environment
 * Returns: { sms_sent, monthly_cost }
 */
export async function fetchTwilioCosts() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    console.warn('⚠️  TWILIO credentials not set — using estimate (500 SMS + phone = $4.75)')
    return {
      sms_sent: 500,
      monthly_cost: 4.75,
      source: 'estimated',
    }
  }

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

    const options = {
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${accountSid}/Messages.json?PageSize=1`,
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }

    // Make the request manually due to auth header requirements
    const response = await new Promise((resolve, reject) => {
      https
        .get(options, (res) => {
          let data = ''
          res.on('data', (chunk) => {
            data += chunk
          })
          res.on('end', () => {
            try {
              resolve(JSON.parse(data))
            } catch (e) {
              reject(e)
            }
          })
        })
        .on('error', reject)
    })

    const smsSent = response.total || 0
    const smsRate = 0.0075
    const phoneNumber = 1.0
    const monthlyCost = smsSent * smsRate + phoneNumber

    return {
      sms_sent: smsSent,
      monthly_cost: monthlyCost,
      source: 'measured',
    }
  } catch (err) {
    console.warn(`⚠️  Failed to fetch Twilio costs: ${err.message}`)
    return {
      sms_sent: 500,
      monthly_cost: 4.75,
      source: 'fallback',
    }
  }
}

/**
 * Fetch all costs from real APIs with fallbacks to estimates
 */
export async function fetchAllCosts() {
  const [supabase, vercel, r2, resend, twilio] = await Promise.all([
    fetchSupabaseCosts(),
    fetchVercelCosts(),
    fetchR2Costs(),
    fetchResendCosts(),
    fetchTwilioCosts(),
  ])

  return {
    supabase,
    vercel,
    r2,
    resend,
    twilio,
    meilisearch: {
      monthly_cost: 0,
      source: 'self-hosted',
    },
  }
}
