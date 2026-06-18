import React, { useState } from 'react';
import { validatePassword } from '@/utils/passwordValidation';
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
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/Logo';
import { useTranslation } from 'react-i18next';

const SEX_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];

const darkCoralBackground = require('@/assets/images/coral-background-dark.jpg');

const IOS_STORE_URL = 'https://apps.apple.com/app/id6780519891';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.erebus.diveapp';

function WebSignupBlock() {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <ImageBackground
      source={darkCoralBackground}
      style={styles.backgroundImage}
      imageStyle={styles.webBackgroundImage}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={[styles.scrollContent, styles.webScrollContent]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </Pressable>

          <View style={styles.header}>
            <Logo size={80} primaryColor={colors.primary} />
            <Text style={[styles.title, { color: '#FFFFFF' }]}>{t('auth.mobileAppOnly')}</Text>
            <Text style={[styles.subtitle, { color: 'rgba(255,255,255,0.7)' }]}>
              {t('auth.mobileAppOnlySubtitle')}
            </Text>
          </View>

          <View style={styles.form}>
            <Pressable
              style={[styles.storeButton, { backgroundColor: '#000000', borderColor: 'rgba(255,255,255,0.3)' }]}
              onPress={() => Linking.openURL(IOS_STORE_URL)}
            >
              <Ionicons name="logo-apple" size={24} color="#FFFFFF" />
              <View style={styles.storeButtonText}>
                <Text style={styles.storeButtonTop}>Download on the</Text>
                <Text style={styles.storeButtonMain}>App Store</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.storeButton, { backgroundColor: '#000000', borderColor: 'rgba(255,255,255,0.3)' }]}
              onPress={() => Linking.openURL(ANDROID_STORE_URL)}
            >
              <Ionicons name="logo-google-playstore" size={24} color="#FFFFFF" />
              <View style={styles.storeButtonText}>
                <Text style={styles.storeButtonTop}>Get it on</Text>
                <Text style={styles.storeButtonMain}>Google Play</Text>
              </View>
            </Pressable>

            <View style={styles.loginContainer}>
              <Text style={[styles.loginText, { color: 'rgba(255,255,255,0.7)' }]}>{t('auth.alreadyHaveAccount')} </Text>
              <Pressable onPress={() => router.push('/(auth)/login')}>
                <Text style={[styles.loginLink, { color: colors.primary }]}>{t('auth.signIn')}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </ImageBackground>
  );
}

export default function SignupScreen() {
  const { colors } = useTheme();
  const { signup } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  if (Platform.OS === 'web') {
    return <WebSignupBlock />;
  }

  const sexOptionLabels: Record<string, string> = {
    'Male': t('auth.male'),
    'Female': t('auth.female'),
    'Other': t('auth.other'),
    'Prefer not to say': t('auth.preferNotToSay'),
  };

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [showSexPicker, setShowSexPicker] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async () => {
    if (!email.trim()) {
      setError(t('auth.pleaseEnterEmail'));
      return;
    }
    if (!password) {
      setError(t('auth.pleaseEnterNewPassword'));
      return;
    }
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      setError(t(pwCheck.errorKey));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (!privacyAccepted) {
      setError(t('auth.pleaseAcceptPrivacy'));
      return;
    }
    if (!termsAccepted) {
      setError(t('auth.pleaseAcceptTerms'));
      return;
    }

    setError('');
    setIsLoading(true);

    const ageNum = age ? parseInt(age, 10) : undefined;
    
    const result = await signup(
      email.trim(),
      password,
      firstName.trim() || undefined,
      lastName.trim() || undefined,
      ageNum,
      sex || undefined,
      privacyAccepted,
      termsAccepted
    );

    setIsLoading(false);

    if (!result.success) {
      setError(result.error || t('auth.signupFailed'));
    }
  };

  return (
    <ImageBackground
      source={darkCoralBackground}
      style={[styles.backgroundImage, Platform.OS === 'web' && styles.webBackground]}
      imageStyle={Platform.OS === 'web' ? styles.webBackgroundImage : undefined}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, Platform.OS === 'web' && styles.webScrollContent]}
            keyboardShouldPersistTaps="handled"
          >
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>

        <View style={styles.header}>
          <Logo size={80} primaryColor={colors.primary} />
          <Text style={[styles.title, { color: '#FFFFFF' }]}>{t('auth.createAccount')}</Text>
          <Text style={[styles.subtitle, { color: 'rgba(255,255,255,0.7)' }]}>
            {t('auth.joinErebus')}
          </Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
              <Ionicons name="alert-circle" size={20} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.nameRow}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: '#FFFFFF' }]}>{t('auth.firstName')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
                <TextInput
                  style={[styles.input, { color: '#FFFFFF' }]}
                  placeholder={t('auth.firstNamePlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: '#FFFFFF' }]}>{t('auth.lastName')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
                <TextInput
                  style={[styles.input, { color: '#FFFFFF' }]}
                  placeholder={t('auth.lastNamePlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          </View>

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
                placeholder={t('auth.createPassword')}
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

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: '#FFFFFF' }]}>{t('auth.confirmPassword')}</Text>
            <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
              <TextInput
                style={[styles.input, { color: '#FFFFFF' }]}
                placeholder={t('auth.confirmYourPassword')}
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.nameRow}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: '#FFFFFF' }]}>{t('auth.ageOptional')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                <TextInput
                  style={[styles.input, { color: '#FFFFFF' }]}
                  placeholder={t('auth.agePlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={age}
                  onChangeText={(text) => setAge(text.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: '#FFFFFF' }]}>{t('auth.sexOptional')}</Text>
              <Pressable 
                style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}
                onPress={() => setShowSexPicker(!showSexPicker)}
              >
                <Ionicons name="person-outline" size={20} color={colors.primary} />
                <Text style={[styles.input, { color: sex ? '#FFFFFF' : 'rgba(255,255,255,0.5)', paddingTop: 14 }]}>
                  {sex ? sexOptionLabels[sex] : t('common.select')}
                </Text>
                <Ionicons name="chevron-down" size={20} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {showSexPicker && (
            <View style={[styles.pickerContainer, { backgroundColor: 'rgba(0,0,0,0.7)', borderColor: 'rgba(255,255,255,0.3)' }]}>
              {SEX_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.pickerOption, sex === option && { backgroundColor: colors.primary + '30' }]}
                  onPress={() => {
                    setSex(option);
                    setShowSexPicker(false);
                  }}
                >
                  <Text style={[styles.pickerOptionText, { color: '#FFFFFF' }]}>{sexOptionLabels[option]}</Text>
                  {sex === option && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.consentContainer}>
            <View style={styles.checkboxRow}>
              <Pressable 
                onPress={() => setPrivacyAccepted(!privacyAccepted)}
                style={styles.checkboxTouchable}
              >
                <View style={[styles.checkbox, { borderColor: 'rgba(255,255,255,0.5)' }, privacyAccepted && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {privacyAccepted && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </View>
              </Pressable>
              <View style={styles.consentTextRow}>
                <Text style={[styles.consentText, { color: 'rgba(255,255,255,0.8)' }]}>{t('auth.iHaveReadAndAccept')} </Text>
                <Pressable onPress={() => router.push('/(auth)/privacy' as any)}>
                  <Text style={{ color: colors.primary, textDecorationLine: 'underline', fontSize: 14 }}>{t('auth.privacyPolicy')}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.checkboxRow}>
              <Pressable 
                onPress={() => setTermsAccepted(!termsAccepted)}
                style={styles.checkboxTouchable}
              >
                <View style={[styles.checkbox, { borderColor: 'rgba(255,255,255,0.5)' }, termsAccepted && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {termsAccepted && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </View>
              </Pressable>
              <View style={styles.consentTextRow}>
                <Text style={[styles.consentText, { color: 'rgba(255,255,255,0.8)' }]}>{t('auth.iHaveReadAndAccept')} </Text>
                <Pressable onPress={() => router.push('/(auth)/terms' as any)}>
                  <Text style={{ color: colors.primary, textDecorationLine: 'underline', fontSize: 14 }}>{t('auth.termsAndConditions')}</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <Pressable
            style={[styles.signupButton, { backgroundColor: colors.primary }]}
            onPress={handleSignup}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.signupButtonText}>{t('auth.createAccount')}</Text>
            )}
          </Pressable>

          <View style={styles.loginContainer}>
            <Text style={[styles.loginText, { color: 'rgba(255,255,255,0.7)' }]}>{t('auth.alreadyHaveAccount')} </Text>
            <Pressable onPress={() => router.push('/(auth)/login')}>
              <Text style={[styles.loginLink, { color: colors.primary }]}>{t('auth.signIn')}</Text>
            </Pressable>
          </View>
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
    marginBottom: 32,
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
    gap: 16,
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
  nameRow: {
    flexDirection: 'row',
    gap: 12,
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
  signupButton: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  signupButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  loginText: {
    fontSize: 14,
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerOptionText: {
    fontSize: 16,
  },
  consentContainer: {
    gap: 12,
    marginTop: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  checkboxTouchable: {
    marginRight: 8,
  },
  consentTextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  consentText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  storeButtonText: {
    alignItems: 'flex-start',
  },
  storeButtonTop: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '400',
  },
  storeButtonMain: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
