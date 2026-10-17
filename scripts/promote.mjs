#!/usr/bin/env node
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const VERCEL_ORG_ID = process.env.VERCEL_ORG_ID
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID

const projectRoot = process.cwd()

function getLatestDeployment() {
  if (!VERCEL_TOKEN || !VERCEL_ORG_ID || !VERCEL_PROJECT_ID) {
    throw new Error('Missing VERCEL_TOKEN, VERCEL_ORG_ID, or VERCEL_PROJECT_ID')
  }

  const cmd = `curl -s -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "https://api.vercel.com/v6/deployments?teamId=${VERCEL_ORG_ID}&projectId=${VERCEL_PROJECT_ID}&limit=10" \
    | jq '.deployments[] | select(.state=="READY") | .uid' \
    | head -1`

  try {
    const output = execSync(cmd, { encoding: 'utf-8', shell: '/bin/bash' })
    return output.trim().replace(/"/g, '')
  } catch (_error) {
    throw new Error('Failed to fetch latest deployment')
  }
}

function getDeploymentUrl(deploymentId) {
  if (!VERCEL_TOKEN || !VERCEL_ORG_ID) {
    throw new Error('Missing Vercel credentials')
  }

  const cmd = `curl -s -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "https://api.vercel.com/v13/deployments/${deploymentId}?teamId=${VERCEL_ORG_ID}" \
    | jq -r '.url'`

  try {
    const output = execSync(cmd, { encoding: 'utf-8', shell: '/bin/bash' })
    return output.trim()
  } catch (_error) {
    throw new Error('Failed to fetch deployment URL')
  }
}

async function runSmokeTests(deploymentUrl) {
  console.log(`\n🔥 Running smoke tests against ${deploymentUrl}...\n`)

  const tests = [
    {
      name: 'Homepage loads',
      test: async () => {
        const response = await fetch(`https://${deploymentUrl}`, { timeout: 10000 })
        return response.status === 200
      },
    },
    {
      name: 'API health check',
      test: async () => {
        const response = await fetch(`https://${deploymentUrl}/api/health`, { timeout: 10000 })
        return response.status === 200 || response.status === 401
      },
    },
    {
      name: 'Sitemap accessible',
      test: async () => {
        const response = await fetch(`https://${deploymentUrl}/sitemap.xml`, { timeout: 10000 })
        return response.status === 200
      },
    },
    {
      name: 'Robots.txt accessible',
      test: async () => {
        const response = await fetch(`https://${deploymentUrl}/robots.txt`, { timeout: 10000 })
        return response.status === 200
      },
    },
  ]

  let passed = 0
  let failed = 0

  for (const { name, test } of tests) {
    try {
      const result = await test()
      if (result) {
        console.log(`✅ ${name}`)
        passed++
      } else {
        console.log(`❌ ${name}`)
        failed++
      }
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`)
      failed++
    }
  }

  console.log(`\n📊 Smoke tests: ${passed} passed, ${failed} failed\n`)
  return failed === 0
}

async function promoteDeployment(deploymentId) {
  if (!VERCEL_TOKEN || !VERCEL_ORG_ID || !VERCEL_PROJECT_ID) {
    throw new Error('Missing Vercel credentials')
  }

  const cmd = `curl -s -X POST -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "https://api.vercel.com/v13/deployments/${deploymentId}/promote" \
    -d '{"teamId":"${VERCEL_ORG_ID}"}' \
    -H "Content-Type: application/json"`

  try {
    const output = execSync(cmd, { encoding: 'utf-8', shell: '/bin/bash' })
    const result = JSON.parse(output)
    return result
  } catch (error) {
    throw new Error(`Failed to promote deployment: ${error.message}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const deploymentId = args[0]
  const skipTests = args.includes('--skip-tests')

  try {
    let targetDeploymentId = deploymentId

    if (!targetDeploymentId) {
      console.log('📋 Fetching latest deployment...')
      targetDeploymentId = getLatestDeployment()
      if (!targetDeploymentId) {
        throw new Error('No ready deployments found')
      }
      console.log(`✅ Latest deployment: ${targetDeploymentId}`)
    }

    const deploymentUrl = getDeploymentUrl(targetDeploymentId)
    console.log(`📍 Deployment URL: ${deploymentUrl}`)

    console.log('\n🚀 Promoting deployment to production...')
    const result = await promoteDeployment(targetDeploymentId)

    if (result.alias || result.url) {
      console.log('✅ Deployment promoted successfully!')
      console.log(`📝 Alias: ${result.alias || result.url}`)

      if (!skipTests) {
        const testsPass = await runSmokeTests(deploymentUrl)
        if (!testsPass) {
          console.warn('⚠️ Smoke tests failed after promotion. Monitor for issues.')
        }
      }

      fs.writeFileSync(
        path.join(projectRoot, '.last-promotion'),
        JSON.stringify(
          {
            deploymentId: targetDeploymentId,
            url: deploymentUrl,
            timestamp: new Date().toISOString(),
            previousVersion: readLastPromotion()?.version,
            smokeTestsPassed: !skipTests,
          },
          null,
          2,
        ),
        'utf-8',
      )

      console.log('\n✅ Promotion complete!')
    } else {
      throw new Error('Unexpected response from Vercel API')
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`)
    process.exit(1)
  }
}

function readLastPromotion() {
  try {
    const path_to_file = path.join(projectRoot, '.last-promotion')
    return JSON.parse(fs.readFileSync(path_to_file, 'utf-8'))
  } catch {
    return null
  }
}

main()
