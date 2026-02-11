import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import Logo from '@/components/Logo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

const darkCoralBackground = require('@/assets/images/coral-background-dark.jpg');

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { login, loginWithBiometric, biometricCapability, isBiometricEnabled } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [hasCachedSession, setHasCachedSession] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    checkCachedSession();
  }, []);

  const checkCachedSession = async () => {
    try {
      const session = await AsyncStorage.getItem('cached_session');
      setHasCachedSession(!!session);
    } catch (error) {
      setHasCachedSession(false);
    }
  };

  const canUseBiometric = biometricCapability?.isSupported && 
    biometricCapability?.isEnrolled && 
    isBiometricEnabled && 
    hasCachedSession;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');

  const handleLogin = async () => {
    if (!email.trim()) {
      setError(t('auth.pleaseEnterEmail'));
      return;
    }
    if (!password) {
      setError(t('auth.pleaseEnterPassword'));
      return;
    }

    setError('');
    setIsLoading(true);

    const result = await login(email.trim(), password);

    setIsLoading(false);

    if (!result.success) {
      setError(result.error || t('auth.loginFailed'));
    }
  };

  const handleBiometricLogin = async () => {
    setError('');
    setBiometricLoading(true);

    const result = await loginWithBiometric();

    setBiometricLoading(false);

    if (!result.success) {
      setError(result.error || t('auth.biometricLoginFailed'));
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setForgotError(t('auth.pleaseEnterEmail'));
      return;
    }

    setForgotError('');
    setForgotMessage('');
    setForgotLoading(true);

    try {
      const response = await fetch(`${getApiUrl()}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setForgotMessage(data.message);
      } else {
        setForgotError(data.error || t('auth.failedToProcess'));
      }
    } catch (err) {
      setForgotError(t('common.networkError'));
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgotModal = () => {
    setForgotPasswordVisible(false);
    setForgotEmail('');
    setForgotMessage('');
    setForgotError('');
  };

  return (
    <ImageBackground source={darkCoralBackground} style={styles.backgroundImage} resizeMode="cover">
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>

        <View style={styles.header}>
          <Logo size={80} primaryColor={colors.primary} />
          <Text style={[styles.title, { color: '#FFFFFF' }]}>{t('auth.welcomeBack')}</Text>
          <Text style={[styles.subtitle, { color: 'rgba(255,255,255,0.7)' }]}>
            {t('auth.signInToContinue')}
          </Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
              <Ionicons name="alert-circle" size={20} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: '#FFFFFF' }]}>{t('auth.email')}</Text>
            <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
              <Ionicons name="mail-outline" size={20} color={colors.primary} />
              <TextInput
                style={[styles.input, { color: '#FFFFFF' }]}
                placeholder={t('auth.enterEmail')}
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: '#FFFFFF' }]}>{t('auth.password')}</Text>
            <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
              <TextInput
                style={[styles.input, { color: '#FFFFFF' }]}
                placeholder={t('auth.enterPassword')}
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Pressable 
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.primary}
                />
              </Pressable>
            </View>
          </View>

          <Pressable onPress={() => setForgotPasswordVisible(true)}>
            <Text style={[styles.forgotPassword, { color: colors.primary }]}>{t('auth.forgotPassword')}</Text>
          </Pressable>

          <Pressable
            style={[styles.loginButton, { backgroundColor: colors.primary }]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>{t('auth.signIn')}</Text>
            )}
          </Pressable>

          {canUseBiometric && (
            <Pressable
              style={[styles.biometricButton, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}
              onPress={handleBiometricLogin}
              disabled={biometricLoading}
            >
              {biometricLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Ionicons 
                    name={biometricCapability?.biometricTypeName?.includes('Face') ? 'scan-outline' : 'finger-print-outline'} 
                    size={24} 
                    color={colors.primary} 
                  />
                  <Text style={[styles.biometricButtonText, { color: '#FFFFFF' }]}>
                    {t('auth.loginWithBiometric', { type: biometricCapability?.biometricTypeName || 'Biometric' })}
                  </Text>
                </>
              )}
            </Pressable>
          )}

          <View style={styles.signupContainer}>
            <Text style={[styles.signupText, { color: 'rgba(255,255,255,0.7)' }]}>{t('auth.noAccount')} </Text>
            <Pressable onPress={() => router.push('/(auth)/signup')}>
              <Text style={[styles.signupLink, { color: colors.primary }]}>{t('auth.signUp')}</Text>
            </Pressable>
          </View>
          </View>
          </ScrollView>

          <Modal
            visible={forgotPasswordVisible}
            transparent
            animationType="fade"
            onRequestClose={closeForgotModal}
          >
            <Pressable style={styles.modalOverlay} onPress={closeForgotModal}>
              <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{t('auth.forgotPasswordTitle')}</Text>
                  <Pressable onPress={closeForgotModal}>
                    <Ionicons name="close" size={24} color={colors.text} />
                  </Pressable>
                </View>

                <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
                  {t('auth.forgotPasswordDescription')}
                </Text>

                {forgotMessage ? (
                  <View style={[styles.successContainer, { backgroundColor: colors.primary + '20' }]}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                    <Text style={[styles.successText, { color: colors.primary }]}>{forgotMessage}</Text>
                  </View>
                ) : null}

                {forgotError ? (
                  <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
                    <Ionicons name="alert-circle" size={20} color={colors.error} />
                    <Text style={[styles.errorText, { color: colors.error }]}>{forgotError}</Text>
                  </View>
                ) : null}

                {!forgotMessage && (
                  <>
                    <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 16 }]}>
                      <Ionicons name="mail-outline" size={20} color={colors.primary} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder={t('auth.enterEmail')}
                        placeholderTextColor={colors.textSecondary}
                        value={forgotEmail}
                        onChangeText={setForgotEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>

                    <Pressable
                      style={[styles.loginButton, { backgroundColor: colors.primary, marginTop: 16 }]}
                      onPress={handleForgotPassword}
                      disabled={forgotLoading}
                    >
                      {forgotLoading ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.loginButtonText}>{t('auth.sendResetRequest')}</Text>
                      )}
                    </Pressable>
                  </>
                )}

                {forgotMessage && (
                  <Pressable
                    style={[styles.loginButton, { backgroundColor: colors.primary, marginTop: 16 }]}
                    onPress={closeForgotModal}
                  >
                    <Text style={styles.loginButtonText}>{t('common.done')}</Text>
                  </Pressable>
                )}
              </Pressable>
            </Pressable>
          </Modal>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  form: {
    gap: 20,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 12,
  },
  successText: {
    flex: 1,
    fontSize: 14,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  eyeButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forgotPassword: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: -8,
  },
  loginButton: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  biometricButton: {
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    gap: 8,
  },
  biometricButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  signupText: {
    fontSize: 14,
  },
  signupLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    width: '90%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});
