import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Production URL for native apps (iOS/Android)
const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://erebus.nammu-tech.com';

export function getApiUrl(): string {
  // Web: Always use current origin (works in both dev and production)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Development: API runs on port 3001
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    // Replit dev environment: API on port 3001
    if (window.location.host.includes('.replit.dev')) {
      return `${window.location.protocol}//${window.location.hostname}:3001`;
    }
    // Production (.replit.app): API and frontend on same origin
    return window.location.origin;
  }
  
  // Native dev: Use debugger host
  if (__DEV__) {
    const debuggerHost = Constants.expoConfig?.hostUri?.split(':')[0];
    if (debuggerHost) {
      return `http://${debuggerHost}:3001`;
    }
  }
  
  // Native production: Use configured URL
  return PRODUCTION_API_URL;
}
