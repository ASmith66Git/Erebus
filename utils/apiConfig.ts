import { Platform } from 'react-native';
import Constants from 'expo-constants';

const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL || 
  'https://erebus-dive-app.replit.app';

export function getApiUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location.host;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return `${window.location.protocol}//localhost:3001`;
    }
    if (host.includes('.replit.dev') || host.includes('.replit.app')) {
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
