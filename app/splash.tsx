import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const { colors } = useTheme();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/' as any);
    }
  }, [isAuthenticated, isLoading]);

  const handleGetStarted = () => {
    router.push('/(auth)/login' as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="water" size={80} color={colors.primary} />
        </View>
        
        <Text style={[styles.title, { color: colors.text }]}>Erebus</Text>
        
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>
          Track your dives, Plan your dives,{'\n'}Connect with divers, and much more
        </Text>

        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="analytics-outline" size={24} color={colors.primary} />
            <Text style={[styles.featureText, { color: colors.text }]}>Track your dives</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="calendar-outline" size={24} color={colors.primary} />
            <Text style={[styles.featureText, { color: colors.text }]}>Plan your dives</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="people-outline" size={24} color={colors.primary} />
            <Text style={[styles.featureText, { color: colors.text }]}>Connect with divers</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="ellipsis-horizontal-outline" size={24} color={colors.primary} />
            <Text style={[styles.featureText, { color: colors.text }]}>And much more</Text>
          </View>
        </View>
      </View>

      <View style={styles.bottomSection}>
        <Pressable
          style={[styles.getStartedButton, { backgroundColor: colors.primary }]}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 16,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 40,
  },
  features: {
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 16,
  },
  bottomSection: {
    alignItems: 'center',
    gap: 16,
  },
  getStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 30,
    gap: 8,
    width: width - 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  getStartedText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loginLink: {
    fontSize: 14,
  },
});
