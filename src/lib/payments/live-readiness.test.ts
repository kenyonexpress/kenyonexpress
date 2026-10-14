import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LIVE_READY_MESSAGE,
  PLACEHOLDER_API_NAME,
  assessLiveReadiness,
  touchLaunchReadyFlag,
} from './live-readiness'

describe('assessLiveReadiness', () => {
  it('is ready only when mock is the literal false and the API name is real', () => {
    const result = assessLiveReadiness({
      CARDCOM_USE_MOCK: 'false',
      CARDCOM_API_NAME: 'ke-prod-7731',
    })
    expect(result).toEqual({
      ready: true,
      useMock: 'false',
      apiName: 'real',
      checkoutEnabled: false,
    })
  })

  it('treats an unset CARDCOM_USE_MOCK as not ready: absence is an unfinished setup', () => {
    expect(assessLiveReadiness({ CARDCOM_API_NAME: 'ke-prod-7731' })).toMatchObject({
      ready: false,
      useMock: 'unset',
    })
    expect(
      assessLiveReadiness({ CARDCOM_USE_MOCK: '  ', CARDCOM_API_NAME: 'ke-prod-7731' }),
    ).toMatchObject({ ready: false, useMock: 'unset' })
  })

  it('is not ready while mock is on, or on any value that is not exactly false', () => {
    expect(
      assessLiveReadiness({ CARDCOM_USE_MOCK: 'true', CARDCOM_API_NAME: 'ke-prod' }),
    ).toMatchObject({ ready: false, useMock: 'true' })
    expect(
      assessLiveReadiness({ CARDCOM_USE_MOCK: 'FALSE', CARDCOM_API_NAME: 'ke-prod' }),
    ).toMatchObject({ ready: false, useMock: 'other' })
    expect(
      assessLiveReadiness({ CARDCOM_USE_MOCK: '0', CARDCOM_API_NAME: 'ke-prod' }),
    ).toMatchObject({ ready: false, useMock: 'other' })
  })

  it.each(['pending', 'PENDING-ofir', 'test', 'cardcom-TEST-user', 'placeholder', 'Placeholder1'])(
    'rejects the stand-in API name %s',
    (name) => {
      expect(assessLiveReadiness({ CARDCOM_USE_MOCK: 'false', CARDCOM_API_NAME: name })).toEqual(
        expect.objectContaining({ ready: false, apiName: 'placeholder' }),
      )
    },
  )

  it('reports a missing or blank API name as missing, not as a placeholder', () => {
    expect(assessLiveReadiness({ CARDCOM_USE_MOCK: 'false' })).toMatchObject({
      ready: false,
      apiName: 'missing',
    })
    expect(
      assessLiveReadiness({ CARDCOM_USE_MOCK: 'false', CARDCOM_API_NAME: '  ' }),
    ).toMatchObject({ ready: false, apiName: 'missing' })
  })

  it('reads CHECKOUT_ENABLED as the literal true only', () => {
    const base = { CARDCOM_USE_MOCK: 'false', CARDCOM_API_NAME: 'ke-prod' }
    expect(assessLiveReadiness({ ...base, CHECKOUT_ENABLED: 'true' }).checkoutEnabled).toBe(true)
    expect(assessLiveReadiness({ ...base, CHECKOUT_ENABLED: 'TRUE' }).checkoutEnabled).toBe(false)
    expect(assessLiveReadiness({ ...base, CHECKOUT_ENABLED: '1' }).checkoutEnabled).toBe(false)
    expect(assessLiveReadiness(base).checkoutEnabled).toBe(false)
  })

  it('pins the placeholder pattern and the message Ofir asked for', () => {
    expect(PLACEHOLDER_API_NAME.flags).toContain('i')
    expect(LIVE_READY_MESSAGE).toBe('CARDCOM LIVE READY — flip CHECKOUT_ENABLED=true')
  })
})

describe('touchLaunchReadyFlag', () => {
  let dir: string | null = null

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = null
  })

  it('creates the directory and writes the timestamp', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ke-live-check-'))
    const path = join(dir, 'nested', 'LAUNCH-READY.flag')
    const now = new Date('2026-10-15T10:30:00.000Z')
    await expect(touchLaunchReadyFlag(path, now)).resolves.toBe('written')
    await expect(readFile(path, 'utf8')).resolves.toBe('2026-10-15T10:30:00.000Z\n')
  })

  it('answers unwritable instead of throwing when the path cannot be created', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ke-live-check-'))
    // A regular file where a directory is needed: mkdir -p fails with ENOTDIR.
    const blocker = join(dir, 'blocker')
    await touchLaunchReadyFlag(blocker)
    await expect(touchLaunchReadyFlag(join(blocker, 'LAUNCH-READY.flag'))).resolves.toBe(
      'unwritable',
    )
  })
})
