import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

export interface BiometricAvailability {
  available: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  preferredType: LocalAuthentication.AuthenticationType | null;
}

export interface BiometricAuthResult {
  success: boolean;
  token?: string;
  error?: string;
}

const TOKEN_KEY = 'biometric_auth_token';
const USER_ID_KEY = 'biometric_user_id';

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      return {
        available: false,
        supportedTypes: [],
        preferredType: null,
      };
    }

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      return {
        available: false,
        supportedTypes: [],
        preferredType: null,
      };
    }

    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    // Prefer Face ID > Iris > Fingerprint
    let preferredType: LocalAuthentication.AuthenticationType | null = null;
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      preferredType = LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION;
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      preferredType = LocalAuthentication.AuthenticationType.IRIS;
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      preferredType = LocalAuthentication.AuthenticationType.FINGERPRINT;
    }

    return {
      available: true,
      supportedTypes,
      preferredType,
    };
  } catch {
    return {
      available: false,
      supportedTypes: [],
      preferredType: null,
    };
  }
}

export async function authenticateWithBiometric(
  userId: string,
  reason: string = 'התחברות מאובטחת לחשבונך'
): Promise<BiometricAuthResult> {
  try {
    const availability = await checkBiometricAvailability();

    if (!availability.available) {
      return {
        success: false,
        error: 'Biometric authentication is not available',
      };
    }

    const authenticated = await LocalAuthentication.authenticateAsync({
      disableDeviceFallback: false,
      reason,
      fallbackLabel: 'שימוש בקוד גישה',
    });

    if (!authenticated.success) {
      return {
        success: false,
        error: 'Biometric authentication failed',
      };
    }

    // Generate a secure token (in production, this would be issued by the server)
    const token = generateSecureToken();

    // Store token and user ID securely
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_ID_KEY, userId);

    return {
      success: true,
      token,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function getStoredBiometricToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    return token || null;
  } catch {
    return null;
  }
}

export async function getStoredUserId(): Promise<string | null> {
  try {
    const userId = await SecureStore.getItemAsync(USER_ID_KEY);
    return userId || null;
  } catch {
    return null;
  }
}

export async function clearBiometricAuth(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_ID_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function isBiometricAuthEnabled(): Promise<boolean> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    return token !== null;
  } catch {
    return false;
  }
}

/**
 * Generate a secure token for biometric authentication
 * In production, this should be issued by the server after biometric verification
 */
function generateSecureToken(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `bio_${timestamp}_${random}`;
}

/**
 * Verify a biometric token against stored credentials
 * In production, this would validate against server-issued tokens
 */
export async function verifyBiometricToken(token: string): Promise<boolean> {
  try {
    const storedToken = await getStoredBiometricToken();
    return storedToken === token && token.length > 0;
  } catch {
    return false;
  }
}
