import { passkeyChallengeSecret } from '@/lib/auth/passkeys/config'
import { isServedOverHttps } from '@/lib/auth/session-cookie'
import {
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_TTL_MS,
  isDeviceTrustedFor,
  sealTrustedDevice,
} from '@/lib/auth/trusted-device'
import { cookies } from 'next/headers'

/** Cookie IO for the remember-device seal; the policy is in lib/auth/trusted-device.ts. */
export async function rememberDevice(userId: string, now: number = Date.now()): Promise<boolean> {
  const secret = passkeyChallengeSecret()
  if (!secret) return false
  const sealed = sealTrustedDevice({ userId, expiresAt: now + TRUSTED_DEVICE_TTL_MS }, secret)
  const cookieStore = await cookies()
  cookieStore.set(TRUSTED_DEVICE_COOKIE, sealed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isServedOverHttps(),
    path: '/',
    maxAge: Math.floor(TRUSTED_DEVICE_TTL_MS / 1000),
  })
  return true
}

export async function isTrustedDevice(userId: string): Promise<boolean> {
  const cookieStore = await cookies()
  return isDeviceTrustedFor(
    cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value,
    userId,
    passkeyChallengeSecret(),
  )
}

export async function forgetDevice(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(TRUSTED_DEVICE_COOKIE)
}
