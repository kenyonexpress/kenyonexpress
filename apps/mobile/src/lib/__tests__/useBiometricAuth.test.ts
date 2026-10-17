import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useBiometricAuth } from '../useBiometricAuth';
import * as biometric from '../biometric';

vi.mock('../biometric');

describe('useBiometricAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with loading state', () => {
    vi.mocked(biometric.checkBiometricAvailability).mockResolvedValue({
      available: false,
      supportedTypes: [],
      preferredType: null,
    });
    vi.mocked(biometric.isBiometricAuthEnabled).mockResolvedValue(false);

    const { result } = renderHook(() => useBiometricAuth());

    expect(result.current.isLoading).toBe(true);
  });

  it('should check biometric availability on mount', async () => {
    vi.mocked(biometric.checkBiometricAvailability).mockResolvedValue({
      available: true,
      supportedTypes: [],
      preferredType: null,
    });
    vi.mocked(biometric.isBiometricAuthEnabled).mockResolvedValue(false);

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.availability.available).toBe(true);
  });

  it('should enable biometric authentication', async () => {
    vi.mocked(biometric.checkBiometricAvailability).mockResolvedValue({
      available: true,
      supportedTypes: [],
      preferredType: null,
    });
    vi.mocked(biometric.isBiometricAuthEnabled).mockResolvedValue(false);
    vi.mocked(biometric.authenticateWithBiometric).mockResolvedValue({
      success: true,
      token: 'bio_test_token',
    });

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let enableResult = false;
    await act(async () => {
      enableResult = await result.current.enableBiometric('user123');
    });

    expect(enableResult).toBe(true);
    expect(result.current.isEnabled).toBe(true);
  });

  it('should handle biometric enable failure', async () => {
    vi.mocked(biometric.checkBiometricAvailability).mockResolvedValue({
      available: true,
      supportedTypes: [],
      preferredType: null,
    });
    vi.mocked(biometric.isBiometricAuthEnabled).mockResolvedValue(false);
    vi.mocked(biometric.authenticateWithBiometric).mockResolvedValue({
      success: false,
      error: 'Biometric failed',
    });

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let enableResult = false;
    await act(async () => {
      enableResult = await result.current.enableBiometric('user123');
    });

    expect(enableResult).toBe(false);
    expect(result.current.error).toBeDefined();
  });

  it('should disable biometric authentication', async () => {
    vi.mocked(biometric.checkBiometricAvailability).mockResolvedValue({
      available: true,
      supportedTypes: [],
      preferredType: null,
    });
    vi.mocked(biometric.isBiometricAuthEnabled).mockResolvedValue(true);
    vi.mocked(biometric.clearBiometricAuth).mockResolvedValue(true);

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isEnabled).toBe(true);

    let disableResult = false;
    await act(async () => {
      disableResult = await result.current.disableBiometric();
    });

    expect(disableResult).toBe(true);
    expect(result.current.isEnabled).toBe(false);
  });

  it('should authenticate with biometric', async () => {
    vi.mocked(biometric.checkBiometricAvailability).mockResolvedValue({
      available: true,
      supportedTypes: [],
      preferredType: null,
    });
    vi.mocked(biometric.isBiometricAuthEnabled).mockResolvedValue(true);
    vi.mocked(biometric.authenticateWithBiometric).mockResolvedValue({
      success: true,
      token: 'bio_auth_token',
    });

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let authResult = false;
    await act(async () => {
      authResult = await result.current.authenticate('user123');
    });

    expect(authResult).toBe(true);
  });

  it('should check status manually', async () => {
    vi.mocked(biometric.checkBiometricAvailability).mockResolvedValue({
      available: false,
      supportedTypes: [],
      preferredType: null,
    });
    vi.mocked(biometric.isBiometricAuthEnabled).mockResolvedValue(false);

    const { result } = renderHook(() => useBiometricAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    vi.mocked(biometric.checkBiometricAvailability).mockResolvedValue({
      available: true,
      supportedTypes: [],
      preferredType: null,
    });
    vi.mocked(biometric.isBiometricAuthEnabled).mockResolvedValue(true);

    await act(async () => {
      await result.current.checkStatus();
    });

    expect(result.current.availability.available).toBe(true);
    expect(result.current.isEnabled).toBe(true);
  });
});
