import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {
  checkBiometricAvailability,
  authenticateWithBiometric,
  getStoredBiometricToken,
  getStoredUserId,
  clearBiometricAuth,
  isBiometricAuthEnabled,
  verifyBiometricToken,
} from '../biometric';

vi.mock('expo-local-authentication');
vi.mock('expo-secure-store');

describe('Biometric Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkBiometricAvailability', () => {
    it('should return unavailable when hardware is not compatible', async () => {
      vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(false);

      const result = await checkBiometricAvailability();

      expect(result.available).toBe(false);
      expect(result.supportedTypes).toEqual([]);
      expect(result.preferredType).toBeNull();
    });

    it('should return unavailable when biometric is not enrolled', async () => {
      vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
      vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(false);

      const result = await checkBiometricAvailability();

      expect(result.available).toBe(false);
      expect(result.supportedTypes).toEqual([]);
      expect(result.preferredType).toBeNull();
    });

    it('should return Face ID as preferred when available', async () => {
      vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
      vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
      vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);

      const result = await checkBiometricAvailability();

      expect(result.available).toBe(true);
      expect(result.supportedTypes).toContain(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      expect(result.preferredType).toBe(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    });

    it('should return Fingerprint as preferred when Face ID is unavailable', async () => {
      vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
      vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
      vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);

      const result = await checkBiometricAvailability();

      expect(result.available).toBe(true);
      expect(result.supportedTypes).toContain(LocalAuthentication.AuthenticationType.FINGERPRINT);
      expect(result.preferredType).toBe(LocalAuthentication.AuthenticationType.FINGERPRINT);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(LocalAuthentication.hasHardwareAsync).mockRejectedValue(new Error('Test error'));

      const result = await checkBiometricAvailability();

      expect(result.available).toBe(false);
      expect(result.supportedTypes).toEqual([]);
      expect(result.preferredType).toBeNull();
    });
  });

  describe('authenticateWithBiometric', () => {
    it('should return failure when biometric is not available', async () => {
      vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(false);
      vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(false);

      const result = await authenticateWithBiometric('user123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.token).toBeUndefined();
    });

    it('should authenticate successfully and store token', async () => {
      vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
      vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
      vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      vi.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
        success: true,
        warning: undefined,
      });
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);

      const result = await authenticateWithBiometric('user123', 'Test reason');

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token).toMatch(/^bio_/);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), result.token);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), 'user123');
    });

    it('should return failure when authentication fails', async () => {
      vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
      vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
      vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      vi.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
        success: false,
        warning: 'User canceled',
      });

      const result = await authenticateWithBiometric('user123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.token).toBeUndefined();
    });

    it('should handle authentication errors', async () => {
      vi.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
      vi.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
      vi.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      vi.mocked(LocalAuthentication.authenticateAsync).mockRejectedValue(new Error('Auth error'));

      const result = await authenticateWithBiometric('user123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Auth error');
    });
  });

  describe('getStoredBiometricToken', () => {
    it('should retrieve stored token', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('test_token_123');

      const token = await getStoredBiometricToken();

      expect(token).toBe('test_token_123');
    });

    it('should return null when no token is stored', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

      const token = await getStoredBiometricToken();

      expect(token).toBeNull();
    });

    it('should return null on error', async () => {
      vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('Storage error'));

      const token = await getStoredBiometricToken();

      expect(token).toBeNull();
    });
  });

  describe('getStoredUserId', () => {
    it('should retrieve stored user ID', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('user_456');

      const userId = await getStoredUserId();

      expect(userId).toBe('user_456');
    });

    it('should return null when no user ID is stored', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

      const userId = await getStoredUserId();

      expect(userId).toBeNull();
    });
  });

  describe('clearBiometricAuth', () => {
    it('should clear stored credentials', async () => {
      vi.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);

      const result = await clearBiometricAuth();

      expect(result).toBe(true);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
    });

    it('should return false on error', async () => {
      vi.mocked(SecureStore.deleteItemAsync).mockRejectedValue(new Error('Delete error'));

      const result = await clearBiometricAuth();

      expect(result).toBe(false);
    });
  });

  describe('isBiometricAuthEnabled', () => {
    it('should return true when token is stored', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('token_exists');

      const enabled = await isBiometricAuthEnabled();

      expect(enabled).toBe(true);
    });

    it('should return false when no token is stored', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

      const enabled = await isBiometricAuthEnabled();

      expect(enabled).toBe(false);
    });

    it('should return false on error', async () => {
      vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('Storage error'));

      const enabled = await isBiometricAuthEnabled();

      expect(enabled).toBe(false);
    });
  });

  describe('verifyBiometricToken', () => {
    it('should verify valid token', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('bio_token_123');

      const valid = await verifyBiometricToken('bio_token_123');

      expect(valid).toBe(true);
    });

    it('should reject invalid token', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('bio_token_123');

      const valid = await verifyBiometricToken('wrong_token');

      expect(valid).toBe(false);
    });

    it('should reject empty token', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('bio_token_123');

      const valid = await verifyBiometricToken('');

      expect(valid).toBe(false);
    });

    it('should return false when no stored token', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

      const valid = await verifyBiometricToken('bio_token_123');

      expect(valid).toBe(false);
    });

    it('should return false on error', async () => {
      vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('Storage error'));

      const valid = await verifyBiometricToken('bio_token_123');

      expect(valid).toBe(false);
    });
  });
});
