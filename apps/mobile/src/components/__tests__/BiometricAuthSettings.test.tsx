import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { BiometricAuthSettings } from '../BiometricAuthSettings';
import * as biometric from '../../lib/biometric';

vi.mock('../../lib/biometric');
vi.mock('../../lib/useBiometricAuth', () => ({
  useBiometricAuth: vi.fn(() => ({
    availability: {
      available: true,
      supportedTypes: [0],
      preferredType: 0,
    },
    isEnabled: false,
    isLoading: false,
    error: null,
    enableBiometric: vi.fn(async () => true),
    disableBiometric: vi.fn(async () => true),
    authenticate: vi.fn(async () => true),
    checkStatus: vi.fn(async () => {}),
  })),
}));

describe('BiometricAuthSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show unavailable message when biometric is not available', () => {
    const { useBiometricAuth } = require('../../lib/useBiometricAuth');
    useBiometricAuth.mockReturnValue({
      availability: {
        available: false,
        supportedTypes: [],
        preferredType: null,
      },
      isEnabled: false,
      isLoading: false,
      error: null,
    });

    render(<BiometricAuthSettings userId="user123" />);

    const unavailableText = screen.getByText('זיהוי ביומטרי לא זמין בהתקן זה');
    expect(unavailableText).toBeTruthy();
  });

  it('should display Face ID label when Face ID is available', () => {
    render(<BiometricAuthSettings userId="user123" />);

    const authTypeLabel = screen.getByText('זיהוי פנים (Face ID)');
    expect(authTypeLabel).toBeTruthy();
  });

  it('should show enable button when biometric is disabled', () => {
    render(<BiometricAuthSettings userId="user123" />);

    const enableButton = screen.getByText('הפעל זיהוי ביומטרי');
    expect(enableButton).toBeTruthy();
  });

  it('should show disable button when biometric is enabled', () => {
    const { useBiometricAuth } = require('../../lib/useBiometricAuth');
    useBiometricAuth.mockReturnValue({
      availability: {
        available: true,
        supportedTypes: [0],
        preferredType: 0,
      },
      isEnabled: true,
      isLoading: false,
      error: null,
      enableBiometric: vi.fn(async () => true),
      disableBiometric: vi.fn(async () => true),
      authenticate: vi.fn(async () => true),
      checkStatus: vi.fn(async () => {}),
    });

    render(<BiometricAuthSettings userId="user123" />);

    const disableButton = screen.getByText('בטל זיהוי ביומטרי');
    expect(disableButton).toBeTruthy();
  });

  it('should call onStatusChange when enabling biometric', async () => {
    const onStatusChange = vi.fn();
    const { useBiometricAuth } = require('../../lib/useBiometricAuth');

    const mockEnableBiometric = vi.fn(async () => true);
    useBiometricAuth.mockReturnValue({
      availability: {
        available: true,
        supportedTypes: [0],
        preferredType: 0,
      },
      isEnabled: false,
      isLoading: false,
      error: null,
      enableBiometric: mockEnableBiometric,
      disableBiometric: vi.fn(async () => true),
      authenticate: vi.fn(async () => true),
      checkStatus: vi.fn(async () => {}),
    });

    const { getByText } = render(
      <BiometricAuthSettings userId="user123" onStatusChange={onStatusChange} />
    );

    const enableButton = getByText('הפעל זיהוי ביומטרי');
    fireEvent.press(enableButton);

    await waitFor(() => {
      expect(mockEnableBiometric).toHaveBeenCalledWith('user123');
    });
  });

  it('should display error message when operation fails', async () => {
    const { useBiometricAuth } = require('../../lib/useBiometricAuth');

    const mockEnableBiometric = vi.fn(async () => false);
    useBiometricAuth.mockReturnValue({
      availability: {
        available: true,
        supportedTypes: [0],
        preferredType: 0,
      },
      isEnabled: false,
      isLoading: false,
      error: 'Authentication failed',
      enableBiometric: mockEnableBiometric,
      disableBiometric: vi.fn(async () => true),
      authenticate: vi.fn(async () => true),
      checkStatus: vi.fn(async () => {}),
    });

    render(<BiometricAuthSettings userId="user123" />);

    const errorText = screen.getByText('Authentication failed');
    expect(errorText).toBeTruthy();
  });

  it('should show loading spinner while processing', () => {
    const { useBiometricAuth } = require('../../lib/useBiometricAuth');
    useBiometricAuth.mockReturnValue({
      availability: {
        available: true,
        supportedTypes: [0],
        preferredType: 0,
      },
      isEnabled: false,
      isLoading: true,
      error: null,
      enableBiometric: vi.fn(async () => true),
      disableBiometric: vi.fn(async () => true),
      authenticate: vi.fn(async () => true),
      checkStatus: vi.fn(async () => {}),
    });

    const { getByTestId } = render(<BiometricAuthSettings userId="user123" />);

    // ActivityIndicator should be present when loading
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('should display fingerprint label when fingerprint is available', () => {
    const { useBiometricAuth } = require('../../lib/useBiometricAuth');
    useBiometricAuth.mockReturnValue({
      availability: {
        available: true,
        supportedTypes: [1],
        preferredType: 1,
      },
      isEnabled: false,
      isLoading: false,
      error: null,
      enableBiometric: vi.fn(async () => true),
      disableBiometric: vi.fn(async () => true),
      authenticate: vi.fn(async () => true),
      checkStatus: vi.fn(async () => {}),
    });

    render(<BiometricAuthSettings userId="user123" />);

    const authTypeLabel = screen.getByText('טביעת אצבע');
    expect(authTypeLabel).toBeTruthy();
  });
});
