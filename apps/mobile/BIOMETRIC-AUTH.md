# Biometric Authentication Integration

## Overview

This mobile app includes secure biometric authentication (Face-ID/Touch-ID) powered by Expo's `expo-local-authentication` library and `expo-secure-store` for secure credential storage in the device keychain.

## Features

- **Face-ID / Touch-ID Support**: Native biometric authentication on iOS and Android
- **Secure Token Storage**: Credentials stored in the device's secure keychain
- **Automatic Type Detection**: Automatically detects and prioritizes available biometric type
- **Graceful Fallback**: Falls back to device passcode/PIN if needed
- **React Hook Integration**: Simple `useBiometricAuth` hook for component integration
- **Hebrew RTL Support**: Full Hebrew language support in UI and error messages

## Architecture

### Core Components

1. **`src/lib/biometric.ts`**: Core biometric authentication utilities
   - `checkBiometricAvailability()`: Detect available biometric authentication types
   - `authenticateWithBiometric()`: Authenticate and store secure token
   - `getStoredBiometricToken()`: Retrieve stored authentication token
   - `isBiometricAuthEnabled()`: Check if biometric auth is enabled
   - `clearBiometricAuth()`: Clear stored credentials
   - `verifyBiometricToken()`: Verify stored token validity

2. **`src/lib/useBiometricAuth.ts`**: React hook for biometric authentication
   - Manages biometric availability and enabled state
   - Provides async functions for enable/disable/authenticate
   - Handles loading and error states automatically

3. **`src/components/BiometricAuthSettings.tsx`**: UI component for biometric settings
   - Displays biometric type (Face ID, Fingerprint, Iris)
   - Enable/disable toggle with status display
   - Error handling and user feedback

## Security Features

### Token Storage
- Tokens stored in device's secure keychain (iOS Keychain, Android Keystore)
- No plain-text credentials in SharedPreferences or UserDefaults
- Automatic cleanup when biometric auth is disabled

### Authentication Flow
1. User requests biometric authentication
2. Device prompts for Face-ID/Touch-ID (or passcode fallback)
3. On success, a secure token is generated and stored
4. Token can be used for subsequent authenticated requests

### Keychain Security
- Private tokens (`TOKEN_KEY = 'biometric_auth_token'`)
- User ID stored separately (`USER_ID_KEY = 'biometric_user_id'`)
- Automatic deletion when auth is disabled

## Usage

### Basic Integration

```typescript
import { useBiometricAuth } from '@/lib/useBiometricAuth';

export function AccountSecurityPage() {
  const { availability, isEnabled, authenticate } = useBiometricAuth();

  if (!availability.available) {
    return <Text>Biometric not available</Text>;
  }

  return (
    <BiometricAuthSettings
      userId={currentUserId}
      onStatusChange={(enabled) => {
        console.log('Biometric status changed:', enabled);
      }}
    />
  );
}
```

### Manual Authentication

```typescript
const { authenticate, error } = useBiometricAuth();

async function handleLogin() {
  const success = await authenticate('user123', 'התחברות לחשבונך');
  if (success) {
    // Proceed with authenticated request
  } else {
    // Handle error
  }
}
```

### Checking Availability

```typescript
const { availability } = useBiometricAuth();

if (availability.preferredType === AuthenticationType.FACIAL_RECOGNITION) {
  // Face-ID available
} else if (availability.preferredType === AuthenticationType.FINGERPRINT) {
  // Fingerprint available
}
```

## Configuration

### app.json Plugin Configuration

```json
{
  "plugins": [
    [
      "expo-local-authentication",
      {
        "faceIDPermission": "זיהוי הפנים משמש להתחברות מאובטחת לחשבונך."
      }
    ]
  ]
}
```

### Android Permissions

The following permissions are automatically added:
- `android.permission.USE_BIOMETRIC` (via expo-local-authentication)
- Optional: `android.permission.USE_FINGERPRINT` (for devices < Android 6.0)

### iOS Entitlements

Face-ID requires the following entitlements (automatically configured by Expo):
- `NSFaceIDUsageDescription`: Required description for Face-ID usage

## API Reference

### `checkBiometricAvailability(): Promise<BiometricAvailability>`

Checks if biometric authentication is available on the device.

**Returns:**
```typescript
{
  available: boolean;
  supportedTypes: AuthenticationType[];
  preferredType: AuthenticationType | null;
}
```

### `authenticateWithBiometric(userId: string, reason?: string): Promise<BiometricAuthResult>`

Authenticates user with biometric and stores secure token.

**Parameters:**
- `userId`: Unique user identifier
- `reason`: Optional prompt message (default: Hebrew)

**Returns:**
```typescript
{
  success: boolean;
  token?: string;
  error?: string;
}
```

### `getStoredBiometricToken(): Promise<string | null>`

Retrieves stored biometric authentication token from keychain.

### `getStoredUserId(): Promise<string | null>`

Retrieves stored user ID from keychain.

### `clearBiometricAuth(): Promise<boolean>`

Clears stored biometric credentials from keychain.

### `isBiometricAuthEnabled(): Promise<boolean>`

Checks if biometric authentication is currently enabled.

### `verifyBiometricToken(token: string): Promise<boolean>`

Verifies a biometric token against stored credentials.

## Hook API: `useBiometricAuth()`

Returns an object with:

```typescript
{
  // State
  availability: BiometricAvailability;
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  enableBiometric(userId: string): Promise<boolean>;
  disableBiometric(): Promise<boolean>;
  authenticate(userId: string, reason?: string): Promise<boolean>;
  checkStatus(): Promise<void>;
}
```

## Error Handling

Common error scenarios:

| Error | Cause | Solution |
|-------|-------|----------|
| "Biometric not available" | Device lacks biometric hardware | Show UI for PIN/password login |
| "Not enrolled" | No biometric data registered | Direct user to device settings |
| "User canceled" | User dismissed authentication prompt | Retry or offer fallback |
| "Storage error" | Keychain access failed | Request permissions or fallback |

## Testing

Biometric authentication is fully testable with mocked Expo modules:

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useBiometricAuth } from '@/lib/useBiometricAuth';

vi.mock('expo-local-authentication');
vi.mock('expo-secure-store');

it('should authenticate with biometric', async () => {
  const { result } = renderHook(() => useBiometricAuth());

  let authenticated = false;
  await act(async () => {
    authenticated = await result.current.authenticate('user123');
  });

  expect(authenticated).toBe(true);
});
```

## Production Checklist

- [ ] iOS provisioning profile includes Face-ID entitlements
- [ ] Android app signed with production keystore
- [ ] Biometric tokens validated server-side
- [ ] Error messages localized to user's language
- [ ] Fallback authentication method enabled
- [ ] User can disable biometric in account settings
- [ ] Token refresh implemented if using JWT
- [ ] Logout clears biometric credentials
- [ ] A/B testing biometric adoption
- [ ] Monitor biometric authentication success/failure rates

## Troubleshooting

### Face-ID not working on iOS

1. Check `NSFaceIDUsageDescription` in app.json
2. Verify app has Face-ID permission in Settings > Privacy
3. Test with real device (simulator support limited)
4. Check iOS min version (iOS 11+)

### Fingerprint not working on Android

1. Verify `android.permission.USE_BIOMETRIC` granted
2. Check device has enrolled fingerprints
3. Test with physical device or emulator with biometric support
4. Min Android API level 23

### Tokens not persisting

1. Check device storage permissions
2. Verify `expo-secure-store` plugin configured
3. Test clearBiometricAuth() to reset state
4. Check console logs for SecureStore errors

## Future Enhancements

- [ ] Multi-factor authentication (biometric + password)
- [ ] Biometric authentication timeout (re-authenticate after X minutes)
- [ ] Biometric enrollment notifications
- [ ] Biometric template storage limits
- [ ] Passkey integration (WebAuthn)
- [ ] Server-side biometric token validation
- [ ] Biometric authentication analytics

## References

- [Expo Local Authentication](https://docs.expo.dev/modules/expo-local-authentication/)
- [Expo Secure Store](https://docs.expo.dev/modules/expo-secure-store/)
- [iOS Security Framework](https://developer.apple.com/security/)
- [Android Biometric API](https://developer.android.com/training/sign-in/biometric-auth)
