import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const { colors } = useTheme();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const fadeAnim = new Animated.Value(0);
  const slideAnim = new Animated.Value(30);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/(tabs)' as any);
    }
  }, [isAuthenticated, isLoading]);

  const handleGetStarted = () => {
    router.push('/(auth)/login' as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      <Animated.View 
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}
      >
        <View style={styles.iconContainer}>
          <Ionicons name="water" size={80} color="#FFFFFF" />
        </View>
        
        <Text style={styles.title}>Erebus</Text>
        
        <Text style={styles.tagline}>
          Everything you need to{'\n'}manage your diving
        </Text>

        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="analytics-outline" size={24} color="#FFFFFF" />
            <Text style={styles.featureText}>Track your dives</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="calendar-outline" size={24} color="#FFFFFF" />
            <Text style={styles.featureText}>Plan adventures</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="people-outline" size={24} color="#FFFFFF" />
            <Text style={styles.featureText}>Connect with divers</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View style={[styles.bottomSection, { opacity: fadeAnim }]}>
        <Pressable
          style={styles.getStartedButton}
          onPress={handleGetStarted}
        >
          <Text style={[styles.getStartedText, { color: colors.primary }]}>Get Started</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.primary} />
        </Pressable>

        <Pressable onPress={() => router.push('/(auth)/login' as any)}>
          <Text style={styles.loginLink}>Already have an account? Log in</Text>
        </Pressable>
      </Animated.View>
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
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
    color: 'rgba(255, 255, 255, 0.9)',
  },
  bottomSection: {
    alignItems: 'center',
    gap: 16,
  },
  getStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
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
  },
  loginLink: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
  },
});
