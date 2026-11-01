/**
 * Passkeys (WebAuthn) server-side helpers
 *
 * Implements passwordless authentication using WebAuthn/FIDO2.
 * Users can register biometric authenticators (Face ID, Touch ID, Windows Hello)
 * or hardware security keys (YubiKey, etc.).
 */

import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { relyingParty } from './webauthn-config'

export interface PasskeyCredential {
  id: string
  user_id: string
  credential_public_key: Uint8Array
  counter: number
  credential_device_type: string
  credential_backed_up: boolean
  transports: AuthenticatorTransportFuture[]
  friendly_name: string | null
  created_at: string
  last_used_at: string | null
}

/**
 * Generate registration options for a new passkey
 */
export async function generatePasskeyRegistrationOptions(
  userId: string,
  userEmail: string,
  userName: string,
) {
  const admin = createAdminClient()
  const rp = relyingParty()

  // Get existing credentials to exclude (prevent re-registering same authenticator)
  const { data: existing } = await admin
    .from('passkey_credentials')
    .select('id')
    .eq('user_id', userId)

  const excludeCredentials = (existing || []).map((cred) => ({
    id: cred.id,
    type: 'public-key' as const,
  }))

  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userID: new TextEncoder().encode(userId),
    userName: userEmail,
    userDisplayName: userName || userEmail,
    // Require user verification (biometric/PIN)
    authenticatorSelection: {
      userVerification: 'required',
      residentKey: 'preferred',
    },
    excludeCredentials,
  })

  return options
}

/**
 * Verify and store a passkey registration
 */
export async function verifyAndStorePasskey(
  userId: string,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  friendlyName?: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()
  const rp = relyingParty()

  let verification: VerifiedRegistrationResponse
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
    })
  } catch (error) {
    log.error('passkey.registration_verification_failed', {
      reason: error instanceof Error ? error.message : 'Unknown error',
    })
    return { success: false, error: 'Passkey verification failed' }
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { success: false, error: 'Passkey verification failed' }
  }

  const regInfo = verification.registrationInfo
  const credentialID = regInfo.credential.id
  const credentialPublicKey = regInfo.credential.publicKey

  // Store in database
  const { error: dbError } = await admin.from('passkey_credentials').insert({
    id: Buffer.from(credentialID).toString('base64url'),
    user_id: userId,
    credential_public_key: Buffer.from(credentialPublicKey),
    counter: regInfo.credential.counter,
    credential_device_type: regInfo.credentialDeviceType,
    credential_backed_up: regInfo.credentialBackedUp,
    transports: response.response.transports || [],
    friendly_name: friendlyName || null,
  })

  if (dbError) {
    log.error('passkey.storage_failed', { reason: dbError.message })
    return { success: false, error: 'Failed to store passkey' }
  }

  log.info('passkey.registered', { user_id: userId })
  return { success: true }
}

/**
 * Generate authentication options for passkey login
 */
export async function generatePasskeyAuthenticationOptions(userId?: string) {
  const admin = createAdminClient()
  const rp = relyingParty()

  let allowCredentials: {
    id: string
    type: 'public-key'
    transports?: AuthenticatorTransportFuture[]
  }[] = []

  if (userId) {
    // User-specific authentication - fetch their credentials
    const { data: credentials } = await admin
      .from('passkey_credentials')
      .select('id, transports')
      .eq('user_id', userId)

    allowCredentials = (credentials || []).map((cred) => ({
      id: cred.id,
      type: 'public-key' as const,
      transports: cred.transports as AuthenticatorTransportFuture[],
    }))
  }

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: 'required',
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
  })

  return options
}

/**
 * Verify passkey authentication and return user ID
 */
export async function verifyPasskeyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const admin = createAdminClient()
  const rp = relyingParty()

  // Find the credential
  const credentialId = response.id
  const { data: credential } = await admin
    .from('passkey_credentials')
    .select('*')
    .eq('id', credentialId)
    .single()

  if (!credential) {
    log.warn('passkey.credential_not_found', { credential_id: credentialId })
    return { success: false, error: 'Passkey not found' }
  }

  let verification: VerifiedAuthenticationResponse
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: credential.id,
        publicKey: new Uint8Array(credential.credential_public_key),
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
      },
    })
  } catch (error) {
    log.error('passkey.authentication_verification_failed', {
      reason: error instanceof Error ? error.message : 'Unknown error',
    })
    return { success: false, error: 'Passkey verification failed' }
  }

  if (!verification.verified) {
    return { success: false, error: 'Passkey verification failed' }
  }

  // Update counter and last_used_at
  const { authenticationInfo } = verification
  await admin
    .from('passkey_credentials')
    .update({
      counter: authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', credentialId)

  log.info('passkey.authentication_success', { user_id: credential.user_id })
  return { success: true, userId: credential.user_id }
}

/**
 * Get user's passkey credentials
 */
export async function getUserPasskeys(userId: string): Promise<PasskeyCredential[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('passkey_credentials')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return (data || []) as PasskeyCredential[]
}

/**
 * Delete a passkey credential
 */
export async function deletePasskey(
  userId: string,
  credentialId: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()

  const { error } = await admin
    .from('passkey_credentials')
    .delete()
    .eq('id', credentialId)
    .eq('user_id', userId)

  if (error) {
    log.error('passkey.deletion_failed', { reason: error.message })
    return { success: false, error: 'Failed to delete passkey' }
  }

  log.info('passkey.deleted', { user_id: userId, credential_id: credentialId })
  return { success: true }
}
