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
  ImageBackground,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { getApiUrl } from '@/utils/apiConfig';
import Logo from '@/components/Logo';
import { useTranslation } from 'react-i18next';

const darkCoralBackground = require('@/assets/images/coral-background-dark.jpg');

export default function ResetPasswordScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useTranslation();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(t('auth.invalidResetToken'));
    }
  }, [token]);

  const handleResetPassword = async () => {
    setError('');

    if (!newPassword) {
      setError(t('auth.pleaseEnterNewPassword'));
      return;
    }

    if (newPassword.length < 6) {
      setError(t('auth.passwordMinLength'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }

    setIsLoading(true);

    try {
      const apiUrl = await getApiUrl();
      const response = await fetch(`${apiUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.error || t('auth.failedToResetPassword'));
      }
    } catch (err) {
      setError(t('common.networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToLogin = () => {
    router.replace('/(auth)/login');
  };

  if (success) {
    return (
      <ImageBackground
        source={darkCoralBackground}
        style={[styles.backgroundImage, Platform.OS === 'web' && styles.webBackground]}
        imageStyle={Platform.OS === 'web' ? styles.webBackgroundImage : undefined}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
          >
            <ScrollView
              contentContainerStyle={[styles.scrollContent, Platform.OS === 'web' && styles.webScrollContent]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.logoContainer}>
                <Logo size={100} />
                <Text style={[styles.appTitle, { color: colors.text }]}>{t('splash.appName')}</Text>
              </View>

              <View style={[styles.formContainer, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                <View style={styles.successContainer}>
                  <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
                  <Text style={[styles.successTitle, { color: colors.text }]}>
                    {t('auth.passwordResetSuccessful')}
                  </Text>
                  <Text style={[styles.successMessage, { color: colors.textSecondary }]}>
                    {t('auth.passwordResetSuccessMessage')}
                  </Text>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.primary }]}
                    onPress={handleGoToLogin}
                  >
                    <Text style={styles.buttonText}>{t('auth.goToLogin')}</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground
      source={darkCoralBackground}
      style={[styles.backgroundImage, Platform.OS === 'web' && styles.webBackground]}
      imageStyle={Platform.OS === 'web' ? styles.webBackgroundImage : undefined}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, Platform.OS === 'web' && styles.webScrollContent]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.logoContainer}>
              <Logo size={100} />
              <Text style={[styles.appTitle, { color: colors.text }]}>{t('splash.appName')}</Text>
            </View>

            <View style={[styles.formContainer, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
              <Text style={[styles.title, { color: colors.text }]}>{t('auth.resetPassword')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {t('auth.enterNewPassword')}
              </Text>

              {error ? (
                <View style={[styles.errorContainer, { backgroundColor: 'rgba(211, 47, 0, 0.1)' }]}>
                  <Ionicons name="alert-circle" size={20} color={colors.primary} />
                  <Text style={[styles.errorText, { color: colors.primary }]}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder={t('auth.newPassword')}
                  placeholderTextColor={colors.textSecondary}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!!token}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder={t('auth.confirmNewPassword')}
                  placeholderTextColor={colors.textSecondary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  editable={!!token}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>

              <Pressable
                style={[
                  styles.button,
                  { backgroundColor: colors.primary },
                  (!token || isLoading) && styles.buttonDisabled,
                ]}
                onPress={handleResetPassword}
                disabled={!token || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>{t('auth.resetPasswordButton')}</Text>
                )}
              </Pressable>

              <Pressable style={styles.backLink} onPress={handleGoToLogin}>
                <Ionicons name="arrow-back" size={16} color={colors.primary} />
                <Text style={[styles.backLinkText, { color: colors.primary }]}>
                  {t('auth.backToLogin')}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  webBackground: {
    width: '100%',
    height: '100%',
  },
  webBackgroundImage: {
    width: '100%',
    height: '100%',
  },
  webScrollContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
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
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 8,
    marginTop: 10,
  },
  formContainer: {
    borderRadius: 16,
    padding: 24,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  input: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 44,
    fontSize: 16,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  backLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    gap: 6,
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  successContainer: {
    alignItems: 'center',
    padding: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
});
