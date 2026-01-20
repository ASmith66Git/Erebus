import React, { useState } from 'react';
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

const SEX_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];

const darkCoralBackground = require('@/assets/images/coral-background-dark.jpg');

export default function SignupScreen() {
  const { colors } = useTheme();
  const { signup } = useAuth();
  const router = useRouter();

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
      setError('Please enter your email');
      return;
    }
    if (!password) {
      setError('Please enter a password');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!privacyAccepted) {
      setError('Please accept the Privacy Policy');
      return;
    }
    if (!termsAccepted) {
      setError('Please accept the Terms & Conditions');
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
      setError(result.error || 'Signup failed');
    }
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
          <Text style={[styles.title, { color: '#FFFFFF' }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: 'rgba(255,255,255,0.7)' }]}>
            Join Erebus and start tracking your dives
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
              <Text style={[styles.label, { color: '#FFFFFF' }]}>First Name</Text>
              <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
                <TextInput
                  style={[styles.input, { color: '#FFFFFF' }]}
                  placeholder="First"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: '#FFFFFF' }]}>Last Name</Text>
              <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
                <TextInput
                  style={[styles.input, { color: '#FFFFFF' }]}
                  placeholder="Last"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: '#FFFFFF' }]}>Email</Text>
            <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
              <Ionicons name="mail-outline" size={20} color={colors.primary} />
              <TextInput
                style={[styles.input, { color: '#FFFFFF' }]}
                placeholder="Enter your email"
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
            <Text style={[styles.label, { color: '#FFFFFF' }]}>Password</Text>
            <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
              <TextInput
                style={[styles.input, { color: '#FFFFFF' }]}
                placeholder="Create a password"
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
            <Text style={[styles.label, { color: '#FFFFFF' }]}>Confirm Password</Text>
            <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
              <TextInput
                style={[styles.input, { color: '#FFFFFF' }]}
                placeholder="Confirm your password"
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
              <Text style={[styles.label, { color: '#FFFFFF' }]}>Age (Optional)</Text>
              <View style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                <TextInput
                  style={[styles.input, { color: '#FFFFFF' }]}
                  placeholder="Age"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={age}
                  onChangeText={(text) => setAge(text.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: '#FFFFFF' }]}>Sex (Optional)</Text>
              <Pressable 
                style={[styles.inputContainer, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.3)' }]}
                onPress={() => setShowSexPicker(!showSexPicker)}
              >
                <Ionicons name="person-outline" size={20} color={colors.primary} />
                <Text style={[styles.input, { color: sex ? '#FFFFFF' : 'rgba(255,255,255,0.5)', paddingTop: 14 }]}>
                  {sex || 'Select'}
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
                  <Text style={[styles.pickerOptionText, { color: '#FFFFFF' }]}>{option}</Text>
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
                <Text style={[styles.consentText, { color: 'rgba(255,255,255,0.8)' }]}>I have read and accept the </Text>
                <Pressable onPress={() => router.push('/(auth)/privacy' as any)}>
                  <Text style={{ color: colors.primary, textDecorationLine: 'underline', fontSize: 14 }}>Privacy Policy</Text>
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
                <Text style={[styles.consentText, { color: 'rgba(255,255,255,0.8)' }]}>I have read and accept the </Text>
                <Pressable onPress={() => router.push('/(auth)/terms' as any)}>
                  <Text style={{ color: colors.primary, textDecorationLine: 'underline', fontSize: 14 }}>Terms & Conditions</Text>
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
              <Text style={styles.signupButtonText}>Create Account</Text>
            )}
          </Pressable>

          <View style={styles.loginContainer}>
            <Text style={[styles.loginText, { color: 'rgba(255,255,255,0.7)' }]}>Already have an account? </Text>
            <Pressable onPress={() => router.push('/(auth)/login')}>
              <Text style={[styles.loginLink, { color: colors.primary }]}>Sign In</Text>
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
});
