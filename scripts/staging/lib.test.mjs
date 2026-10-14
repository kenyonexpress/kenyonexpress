import { describe, expect, it } from 'vitest'
import {
  PRODUCTION_HOSTS,
  STAGING_HOST,
  STAGING_PASSWORD_HEADER,
  STAGING_PROJECT_ID,
  STAGING_SUPABASE_REF,
  STAGING_TEAM_ID,
  hostOf,
  stagingDeployEnv,
  stagingHeaders,
  stagingMarkers,
  stagingMarkersOnProductionHost,
} from './lib.mjs'

describe('hostOf', () => {
  it('reads a hostname and lower-cases it', () => {
    expect(hostOf('https://WWW.kenyonexpress.co.il/')).toBe('www.kenyonexpress.co.il')
    expect(hostOf(` https://${STAGING_HOST} `)).toBe(STAGING_HOST)
  })

  it('is null for anything that is not a URL', () => {
    expect(hostOf(undefined)).toBeNull()
    expect(hostOf('')).toBeNull()
    expect(hostOf('kenyonexpress.co.il')).toBeNull()
    expect(hostOf(42)).toBeNull()
  })
})

describe('stagingMarkers', () => {
  it('finds nothing in a production-shaped environment', () => {
    expect(
      stagingMarkers({
        NEXT_PUBLIC_APP_URL: 'https://www.kenyonexpress.co.il',
        NEXT_PUBLIC_SUPABASE_URL: 'https://ixvwfbuvfxxsjiywhbbb.supabase.co',
        SENTRY_ENVIRONMENT: 'production',
      }),
    ).toEqual([])
  })

  it('names each marker it finds', () => {
    expect(
      stagingMarkers({
        STAGING_PASSWORD: 'x',
        SENTRY_ENVIRONMENT: 'staging',
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'staging',
        NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_SUPABASE_REF}.supabase.co`,
      }),
    ).toEqual([
      'STAGING_PASSWORD',
      'SENTRY_ENVIRONMENT=staging',
      'NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging',
      `NEXT_PUBLIC_SUPABASE_URL=${STAGING_SUPABASE_REF}`,
    ])
  })

  it('a blank password is not a marker', () => {
    expect(stagingMarkers({ STAGING_PASSWORD: '  ' })).toEqual([])
  })
})

describe('stagingMarkersOnProductionHost', () => {
  it('is null on the staging host whatever the markers', () => {
    expect(
      stagingMarkersOnProductionHost({
        NEXT_PUBLIC_APP_URL: `https://${STAGING_HOST}`,
        STAGING_PASSWORD: 'x',
      }),
    ).toBeNull()
  })

  it('is null on the production host with no markers', () => {
    expect(
      stagingMarkersOnProductionHost({ NEXT_PUBLIC_APP_URL: 'https://www.kenyonexpress.co.il' }),
    ).toBeNull()
  })

  it('refuses the password on either production host', () => {
    for (const host of PRODUCTION_HOSTS) {
      expect(
        stagingMarkersOnProductionHost({
          NEXT_PUBLIC_APP_URL: `https://${host}`,
          STAGING_PASSWORD: 'x',
        }),
      ).toEqual({ host, markers: ['STAGING_PASSWORD'] })
    }
  })

  it('is null with no app URL at all, which the preflight reports on its own', () => {
    expect(stagingMarkersOnProductionHost({ STAGING_PASSWORD: 'x' })).toBeNull()
  })
})

describe('stagingHeaders', () => {
  it('sends the header only when there is a password', () => {
    expect(stagingHeaders('pw')).toEqual({ [STAGING_PASSWORD_HEADER]: 'pw' })
    expect(stagingHeaders(' pw ')).toEqual({ [STAGING_PASSWORD_HEADER]: 'pw' })
    expect(stagingHeaders('')).toEqual({})
    expect(stagingHeaders(undefined)).toEqual({})
  })
})

describe('stagingDeployEnv', () => {
  it('addresses the staging project and nothing else', () => {
    const env = stagingDeployEnv({ PATH: '/bin', VERCEL_PROJECT_ID: 'prj_wrong' })
    expect(env.VERCEL_ORG_ID).toBe(STAGING_TEAM_ID)
    expect(env.VERCEL_PROJECT_ID).toBe(STAGING_PROJECT_ID)
    expect(env.PATH).toBe('/bin')
  })
})
