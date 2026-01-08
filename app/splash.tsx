import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions } from 'react-native';
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
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="water" size={64} color={colors.primary} />
          </View>
          
          <Text style={[styles.title, { color: colors.text }]}>Erebus</Text>
          
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            Track your dives, Plan your dives,{'\n'}Connect with divers, and much more
          </Text>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="analytics-outline" size={22} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.text }]}>Track your dives</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.text }]}>Plan your dives</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="people-outline" size={22} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.text }]}>Connect with divers</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="ellipsis-horizontal-outline" size={22} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.text }]}>And much more</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <Pressable
            style={[
              styles.getStartedButton, 
              { backgroundColor: colors.primary, maxWidth: Math.min(width - 48, 400) }
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingVertical: 24,
    paddingHorizontal: 24,
    minHeight: '100%',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: 12,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  features: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 15,
  },
  bottomSection: {
    alignItems: 'center',
    gap: 16,
    paddingTop: 24,
  },
  getStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 28,
    gap: 8,
    alignSelf: 'stretch',
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
