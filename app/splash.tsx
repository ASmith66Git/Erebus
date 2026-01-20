import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/Logo';

const darkCoralBackground = require('@/assets/images/coral-background-dark.jpg');

export default function SplashScreen() {
  const { colors } = useTheme();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/' as any);
    }
  }, [isAuthenticated, isLoading]);

  const handleGetStarted = () => {
    router.push('/(auth)/login' as any);
  };

  return (
    <ImageBackground source={darkCoralBackground} style={styles.safeArea} resizeMode="cover">
      <View style={styles.overlay}>
        <View style={styles.container}>
        <View style={styles.brandContainer}>
          <View style={styles.logoContainer}>
            <Logo size={88} primaryColor={colors.primary} />
          </View>
          <Text style={[styles.title, { color: '#FFFFFF' }]}>Erebus</Text>
        </View>

        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="analytics-outline" size={20} color={colors.primary} />
            <Text style={[styles.featureText, { color: '#FFFFFF' }]}>Track your dives</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <Text style={[styles.featureText, { color: '#FFFFFF' }]}>Plan your dives</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="people-outline" size={20} color={colors.primary} />
            <Text style={[styles.featureText, { color: '#FFFFFF' }]}>Connect with divers</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="ellipsis-horizontal-outline" size={20} color={colors.primary} />
            <Text style={[styles.featureText, { color: '#FFFFFF' }]}>And much more</Text>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <Pressable
            style={[
              styles.getStartedButton, 
              { backgroundColor: colors.primary, width: Math.min(width - 48, 320) }
            ]}
            onPress={handleGetStarted}
          >
            <Text style={styles.getStartedText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </Pressable>

          <Pressable onPress={() => router.push('/(auth)/login' as any)}>
            <Text style={[styles.loginLink, { color: 'rgba(255,255,255,0.7)' }]}>Already have an account? Log in</Text>
          </Pressable>
        </View>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  features: {
    gap: 10,
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 14,
  },
  bottomSection: {
    alignItems: 'center',
    gap: 12,
  },
  getStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 28,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  getStartedText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loginLink: {
    fontSize: 14,
    paddingVertical: 8,
  },
});
