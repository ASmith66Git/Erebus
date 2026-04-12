import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { SyncProvider } from '@/contexts/SyncContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { errorLogger } from '@/services/errorLogger';
import { SubscriptionProvider, useSubscription, initializeRevenueCat } from '@/lib/revenuecat';
import '@/services/i18n';

if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
}

const queryClient = new QueryClient();

try {
  initializeRevenueCat();
} catch {
  // Handled by SubscriptionProvider's reactive state
}

function RootLayoutNav() {
  const { colorScheme, isDark } = useTheme();
  const { isAuthenticated, isLoading, isAdmin, isTrialActive } = useAuth();
  const { isSubscribed, isLoading: isSubLoading, hasError: hasSubError } = useSubscription();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    errorLogger.initialize();
  }, []);

  const hasAccess = isAdmin || isTrialActive || isSubscribed;

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inSplash = segments[0] === 'splash';
    const inResetPassword = segments[0] === 'reset-password';
    const inPaywall = segments[0] === 'paywall';

    if (!isAuthenticated && !inAuthGroup && !inSplash && !inResetPassword) {
      router.replace('/splash');
    } else if (isAuthenticated && !isSubLoading && !hasAccess && !inPaywall) {
      router.replace('/paywall');
    } else if (isAuthenticated && hasAccess && (inAuthGroup || inSplash || inPaywall)) {
      router.replace('/(app)/(tabs)');
    }
  }, [isAuthenticated, isLoading, isSubscribed, isSubLoading, hasSubError, hasAccess, segments]);

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="splash" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="paywall" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="dive-site/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <ThemeProvider>
            <AuthProvider>
              <SubscriptionProvider>
                <SyncProvider>
                  <RootLayoutNav />
                </SyncProvider>
              </SubscriptionProvider>
            </AuthProvider>
          </ThemeProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
