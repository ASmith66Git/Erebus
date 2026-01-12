import { Platform } from 'react-native';
import Constants from 'expo-constants';

// IMPORTANT: Set EXPO_PUBLIC_API_URL environment variable in eas.json or app.config.js
// to your deployed production URL (e.g., your-app.replit.app)
const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL || '';

export function getApiUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location.host;
    const hostname = window.location.hostname;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return `${window.location.protocol}//localhost:3001`;
    }
    if (host.includes('.replit.dev')) {
      return `${window.location.protocol}//${hostname}:3001`;
    }
    if (host.includes('.replit.app')) {
      return `${window.location.protocol}//${host}`;
    }
    return `${window.location.protocol}//${host}`;
  }
  
  if (__DEV__) {
    const debuggerHost = Constants.expoConfig?.hostUri?.split(':')[0];
    if (debuggerHost) {
      return `http://${debuggerHost}:3001`;
    }
  }
  
  return PRODUCTION_API_URL;
}
