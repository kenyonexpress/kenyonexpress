import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useBiometricAuth } from '../lib/useBiometricAuth';
import { getStoredUserId } from '../lib/biometric';

interface BiometricAuthSettingsProps {
  userId: string;
  onStatusChange?: (enabled: boolean) => void;
}

export function BiometricAuthSettings({ userId, onStatusChange }: BiometricAuthSettingsProps) {
  const {
    availability,
    isEnabled,
    isLoading,
    error,
    enableBiometric,
    disableBiometric,
  } = useBiometricAuth();

  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      setLocalError(error);
    }
  }, [error]);

  if (!availability.available) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>זיהוי ביומטרי</Text>
        <Text style={styles.unavailableText}>
          זיהוי ביומטרי לא זמין בהתקן זה
        </Text>
      </View>
    );
  }

  const handleToggleBiometric = async () => {
    setLocalError(null);

    if (isEnabled) {
      const success = await disableBiometric();
      if (success) {
        Alert.alert('הצלחה', 'זיהוי ביומטרי בוטל בהצלחה');
        onStatusChange?.(false);
      } else {
        setLocalError('לא ניתן לבטל את זיהוי הביומטרי');
      }
    } else {
      const success = await enableBiometric(userId);
      if (success) {
        Alert.alert('הצלחה', 'זיהוי ביומטרי מופעל בהצלחה');
        onStatusChange?.(true);
      } else {
        setLocalError('לא ניתן להפעיל את זיהוי הביומטרי');
      }
    }
  };

  const getAuthTypeLabel = (): string => {
    if (!availability.preferredType) return 'ביומטרי';

    switch (availability.preferredType) {
      case 0: // FACIAL_RECOGNITION
        return 'זיהוי פנים (Face ID)';
      case 1: // FINGERPRINT
        return 'טביעת אצבע';
      case 2: // IRIS
        return 'סריקת עיניים';
      default:
        return 'ביומטרי';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>זיהוי ביומטרי</Text>

      <View style={styles.statusSection}>
        <Text style={styles.description}>
          {getAuthTypeLabel()}
        </Text>
        <Text style={styles.statusText}>
          {isEnabled ? '✓ מופעל' : 'כבוי'}
        </Text>
      </View>

      {localError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{localError}</Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f5c518" />
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.button,
            isEnabled ? styles.disableButton : styles.enableButton,
          ]}
          onPress={handleToggleBiometric}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isEnabled ? 'בטל זיהוי ביומטרי' : 'הפעל זיהוי ביומטרי'}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.helpText}>
        {isEnabled
          ? 'אתה יכול להשתמש בזיהוי ביומטרי להתחברות מאובטחת לחשבונך'
          : 'הפעל זיהוי ביומטרי להתחברות מהירה וביטוחונית'}
      </Text>
    </View>
  );
}

const styles = {
  container: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginVertical: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'right',
  },
  statusSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: '#333',
    textAlign: 'right',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
    textAlign: 'right',
  },
  loadingContainer: {
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginVertical: 8,
  },
  enableButton: {
    backgroundColor: '#f5c518',
  },
  disableButton: {
    backgroundColor: '#e53935',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  unavailableText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right',
    fontStyle: 'italic',
  },
  helpText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'right',
    lineHeight: 18,
  },
};
