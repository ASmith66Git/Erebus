import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BIOMETRIC_ENABLED_KEY = 'biometric_auth_enabled';

export interface BiometricCapability {
  isSupported: boolean;
  isEnrolled: boolean;
  availableTypes: LocalAuthentication.AuthenticationType[];
  biometricTypeName: string;
}

export interface AuthenticationResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

class BiometricService {
  async checkCapability(): Promise<BiometricCapability> {
    if (Platform.OS === 'web') {
      return {
        isSupported: false,
        isEnrolled: false,
        availableTypes: [],
        biometricTypeName: 'Biometric',
      };
    }

    try {
      const isSupported = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const availableTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      let biometricTypeName = 'Biometric';
      if (availableTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        biometricTypeName = Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock';
      } else if (availableTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        biometricTypeName = Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
      } else if (availableTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        biometricTypeName = 'Iris';
      }

      return {
        isSupported,
        isEnrolled,
        availableTypes,
        biometricTypeName,
      };
    } catch (error) {
      console.error('Biometric capability check failed:', error);
      return {
        isSupported: false,
        isEnrolled: false,
        availableTypes: [],
        biometricTypeName: 'Biometric',
      };
    }
  }

  async authenticate(promptMessage?: string): Promise<AuthenticationResult> {
    if (Platform.OS === 'web') {
      return { success: false, error: 'Biometric authentication not available on web' };
    }

    try {
      const capability = await this.checkCapability();
      
      if (!capability.isSupported) {
        return { success: false, error: 'Device does not support biometric authentication' };
      }

      if (!capability.isEnrolled) {
        return { success: false, error: 'No biometric data enrolled on this device' };
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: promptMessage || `Login with ${capability.biometricTypeName}`,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        fallbackLabel: 'Use device passcode',
      });

      if (result.success) {
        return { success: true };
      } else {
        let errorMessage = 'Authentication failed';
        switch (result.error) {
          case 'user_cancel':
            errorMessage = 'Authentication cancelled';
            break;
          case 'lockout':
            errorMessage = 'Too many failed attempts. Please try again later.';
            break;
          case 'not_enrolled':
            errorMessage = 'No biometric data enrolled';
            break;
          case 'not_available':
            errorMessage = 'Biometric authentication not available';
            break;
        }
        return { success: false, error: errorMessage, errorCode: result.error };
      }
    } catch (error: any) {
      console.error('Biometric authentication error:', error);
      return { success: false, error: error.message || 'Authentication failed' };
    }
  }

  async isBiometricEnabled(): Promise<boolean> {
    try {
      const enabled = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
      return enabled === 'true';
    } catch (error) {
      return false;
    }
  }

  async setBiometricEnabled(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
    } catch (error) {
      console.error('Failed to save biometric preference:', error);
    }
  }

  async canUseBiometric(): Promise<boolean> {
    const capability = await this.checkCapability();
    const isEnabled = await this.isBiometricEnabled();
    return capability.isSupported && capability.isEnrolled && isEnabled;
  }
}

export const biometricService = new BiometricService();
export default biometricService;
