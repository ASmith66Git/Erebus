import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { SyncProvider } from '@/contexts/SyncContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { errorLogger } from '@/services/errorLogger';

if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
}

function RootLayoutNav() {
  const { colorScheme, isDark } = useTheme();
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    errorLogger.initialize();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inSplash = segments[0] === 'splash';

    if (!isAuthenticated && !inAuthGroup && !inSplash) {
      router.replace('/splash' as any);
    } else if (isAuthenticated && (inAuthGroup || inSplash)) {
      router.replace('/(app)/(tabs)' as any);
    }
  }, [isAuthenticated, isLoading, segments]);

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="splash" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
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
      <SettingsProvider>
        <ThemeProvider>
          <AuthProvider>
            <SyncProvider>
              <RootLayoutNav />
            </SyncProvider>
          </AuthProvider>
        </ThemeProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
