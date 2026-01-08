import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="water" size={56} color={colors.primary} />
        </View>
        
        <Text style={[styles.title, { color: colors.text }]}>Erebus</Text>

        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="analytics-outline" size={20} color={colors.primary} />
            <Text style={[styles.featureText, { color: colors.text }]}>Track your dives</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <Text style={[styles.featureText, { color: colors.text }]}>Plan your dives</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="people-outline" size={20} color={colors.primary} />
            <Text style={[styles.featureText, { color: colors.text }]}>Connect with divers</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="ellipsis-horizontal-outline" size={20} color={colors.primary} />
            <Text style={[styles.featureText, { color: colors.text }]}>And much more</Text>
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
            <Text style={[styles.loginLink, { color: colors.textSecondary }]}>Already have an account? Log in</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 24,
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
