import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Production URL for native apps (iOS/Android)
const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://expo-erebus--anthony606.replit.app';

export function getApiUrl(): string {
  // Web: Always use current origin (works in both dev and production)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Development: API runs on port 3001
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    
    // Replit dev environment: Port is embedded in subdomain
    // e.g., xxx-00-yyy.spock.replit.dev -> xxx-00-yyy-3001.spock.replit.dev
    if (hostname.includes('.replit.dev')) {
      const parts = hostname.split('.');
      if (parts.length >= 3) {
        // Insert port 3001 before the domain suffix
        parts[0] = parts[0] + '-3001';
        return `${window.location.protocol}//${parts.join('.')}`;
      }
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
