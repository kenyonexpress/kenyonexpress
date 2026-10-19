import { useEffect, useState, useCallback } from 'react';
import {
  checkBiometricAvailability,
  authenticateWithBiometric,
  isBiometricAuthEnabled,
  clearBiometricAuth,
  getStoredUserId,
  verifyBiometricToken,
  BiometricAvailability,
} from './biometric';

interface UseBiometricAuthState {
  availability: BiometricAvailability;
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
}

interface UseBiometricAuthActions {
  enableBiometric: (userId: string) => Promise<boolean>;
  disableBiometric: () => Promise<boolean>;
  authenticate: (userId: string, reason?: string) => Promise<boolean>;
  checkStatus: () => Promise<void>;
}

export function useBiometricAuth(): UseBiometricAuthState & UseBiometricAuthActions {
  const [state, setState] = useState<UseBiometricAuthState>({
    availability: {
      available: false,
      supportedTypes: [],
      preferredType: null,
    },
    isEnabled: false,
    isLoading: true,
    error: null,
  });

  const checkStatus = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const availability = await checkBiometricAvailability();
      const enabled = await isBiometricAuthEnabled();

      setState((prev) => ({
        ...prev,
        availability,
        isEnabled: enabled,
        isLoading: false,
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
    }
  }, []);

  const enableBiometric = useCallback(async (userId: string): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const result = await authenticateWithBiometric(userId);

      if (result.success) {
        setState((prev) => ({
          ...prev,
          isEnabled: true,
          isLoading: false,
        }));
        return true;
      } else {
        setState((prev) => ({
          ...prev,
          error: result.error || 'Failed to enable biometric',
          isLoading: false,
        }));
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      return false;
    }
  }, []);

  const disableBiometric = useCallback(async (): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const result = await clearBiometricAuth();

      if (result) {
        setState((prev) => ({
          ...prev,
          isEnabled: false,
          isLoading: false,
        }));
        return true;
      } else {
        setState((prev) => ({
          ...prev,
          error: 'Failed to disable biometric',
          isLoading: false,
        }));
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      return false;
    }
  }, []);

  const authenticate = useCallback(async (userId: string, reason?: string): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const result = await authenticateWithBiometric(userId, reason);

      if (result.success) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
        }));
        return true;
      } else {
        setState((prev) => ({
          ...prev,
          error: result.error || 'Authentication failed',
          isLoading: false,
        }));
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      return false;
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return {
    ...state,
    enableBiometric,
    disableBiometric,
    authenticate,
    checkStatus,
  };
}
