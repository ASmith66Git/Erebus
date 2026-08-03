import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApiUrl } from '@/utils/apiConfig';
import { setLogoutCallback, clearLogoutCallback } from '@/utils/authFetch';
import notificationService from '@/services/notificationService';
import biometricService, { BiometricCapability } from '@/services/biometricService';

let SecureStore: typeof import('expo-secure-store') | null = null;
if (Platform.OS !== 'web') {
  try {
    SecureStore = require('expo-secure-store');
  } catch (e) {
    console.warn('expo-secure-store not available');
  }
}

interface User {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  age: number | null;
  sex: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  role: 'user' | 'admin';
  profileImage: string | null;
  trialEndsAt: string | null;
}

interface CachedSession {
  token: string;
  user: User;
  cachedAt: number;
  expiresAt: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isOfflineSession: boolean;
  biometricCapability: BiometricCapability | null;
  isBiometricEnabled: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithBiometric: () => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, firstName?: string, lastName?: string, age?: number, sex?: string, privacyAccepted?: boolean, termsAccepted?: boolean) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  checkBiometricCapability: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const OFFLINE_SESSION_VALIDITY_DAYS = 14;
const SESSION_STORAGE_KEY = 'cached_session';
const TOKEN_STORAGE_KEY = 'auth_token';

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS !== 'web' && SecureStore) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      console.warn('SecureStore get failed, falling back to AsyncStorage');
    }
  }
  return await AsyncStorage.getItem(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS !== 'web' && SecureStore) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch (e) {
      console.warn('SecureStore set failed, falling back to AsyncStorage');
    }
  }
  await AsyncStorage.setItem(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS !== 'web' && SecureStore) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      console.warn('SecureStore delete failed');
    }
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    console.warn('AsyncStorage remove failed');
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineSession, setIsOfflineSession] = useState(false);
  const [biometricCapability, setBiometricCapability] = useState<BiometricCapability | null>(null);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const logoutTriggeredRef = useRef(false);

  const handleAutoLogout = useCallback(async () => {
    if (logoutTriggeredRef.current) return;
    logoutTriggeredRef.current = true;
    
    console.log('Session expired - auto logging out');
    try {
      await clearSession();
      setToken(null);
      setUser(null);
      setIsOfflineSession(false);
    } catch (error) {
      console.error('Auto logout error:', error);
    } finally {
      logoutTriggeredRef.current = false;
    }
  }, []);

  useEffect(() => {
    setLogoutCallback(handleAutoLogout);
    return () => {
      clearLogoutCallback();
    };
  }, [handleAutoLogout]);

  useEffect(() => {
    loadStoredAuth();
    checkBiometricCapability();
  }, []);

  async function loadStoredAuth() {
    try {
      const cachedSessionStr = await secureGet(SESSION_STORAGE_KEY);
      
      if (cachedSessionStr) {
        const cachedSession: CachedSession = JSON.parse(cachedSessionStr);
        const now = Date.now();
        const offlineValidityMs = OFFLINE_SESSION_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
        
        if (now - cachedSession.cachedAt < offlineValidityMs) {
          setToken(cachedSession.token);
          setUser(cachedSession.user);
          setIsOfflineSession(true);
          
          refreshUserInBackground(cachedSession.token);
        } else {
          await clearSession();
        }
      } else {
        const storedToken = await secureGet(TOKEN_STORAGE_KEY);
        if (storedToken) {
          setToken(storedToken);
          await fetchUser(storedToken);
        }
      }
    } catch (error) {
      console.error('Error loading auth:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshUserInBackground(authToken: string) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${getApiUrl()}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setIsOfflineSession(false);
        
        await cacheSession(authToken, userData);
        
        initializeNotifications(authToken);
      } else if (response.status === 401) {
        await clearSession();
        setToken(null);
        setUser(null);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.log('Background refresh failed (offline mode):', error.message);
      }
    }
  }

  async function fetchUser(authToken: string) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${getApiUrl()}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setIsOfflineSession(false);
        
        await cacheSession(authToken, userData);
      } else {
        await logout();
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  }

  async function cacheSession(authToken: string, userData: User) {
    const now = Date.now();
    const session: CachedSession = {
      token: authToken,
      user: userData,
      cachedAt: now,
      expiresAt: now + (OFFLINE_SESSION_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
    };
    
    await secureSet(SESSION_STORAGE_KEY, JSON.stringify(session));
    await secureSet(TOKEN_STORAGE_KEY, authToken);
  }

  async function clearSession() {
    await secureDelete(SESSION_STORAGE_KEY);
    await secureDelete(TOKEN_STORAGE_KEY);
  }

  async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(`${getApiUrl()}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        await cacheSession(data.token, data.user);
        setToken(data.token);
        setUser(data.user);
        setIsOfflineSession(false);
        
        initializeNotifications(data.token);
        
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error: any) {
      const url = getApiUrl();
      console.error('Login error:', error, 'API URL:', url);
      if (error.name === 'AbortError') {
        return { success: false, error: `Connection timed out reaching ${url}` };
      }
      return { success: false, error: `Cannot connect to ${url} — ${error?.message || error}` };
    }
  }
  
  async function initializeNotifications(authToken: string) {
    console.log('[AuthContext] Starting notification initialization...');
    try {
      const result = await notificationService.initialize();
      console.log('[AuthContext] Notification initialize result:', result);
      if (result.token) {
        console.log('[AuthContext] Token obtained, registering with server...');
        const registered = await notificationService.registerTokenWithServer(authToken);
        console.log('[AuthContext] Token registration result:', registered);
      } else {
        console.log('[AuthContext] No token obtained, skipping server registration');
      }
    } catch (error) {
      console.log('[AuthContext] Notification initialization failed:', error);
    }
  }

  async function checkBiometricCapability() {
    try {
      const capability = await biometricService.checkCapability();
      setBiometricCapability(capability);
      
      const enabled = await biometricService.isBiometricEnabled();
      setIsBiometricEnabled(enabled);
    } catch (error) {
      console.log('Biometric capability check failed:', error);
    }
  }

  async function handleSetBiometricEnabled(enabled: boolean) {
    await biometricService.setBiometricEnabled(enabled);
    setIsBiometricEnabled(enabled);
  }

  async function loginWithBiometric(): Promise<{ success: boolean; error?: string }> {
    try {
      const cachedSessionStr = await secureGet(SESSION_STORAGE_KEY);
      
      if (!cachedSessionStr) {
        return { success: false, error: 'No saved session. Please log in with your password first.' };
      }

      const cachedSession: CachedSession = JSON.parse(cachedSessionStr);
      const now = Date.now();
      const offlineValidityMs = OFFLINE_SESSION_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
      
      if (now - cachedSession.cachedAt >= offlineValidityMs) {
        return { success: false, error: 'Session expired. Please log in with your password.' };
      }

      const authResult = await biometricService.authenticate('Authenticate to login');
      
      if (!authResult.success) {
        return { success: false, error: authResult.error || 'Authentication failed' };
      }

      setToken(cachedSession.token);
      setUser(cachedSession.user);
      setIsOfflineSession(true);
      
      refreshUserInBackground(cachedSession.token);
      
      return { success: true };
    } catch (error: any) {
      console.error('Biometric login error:', error);
      return { success: false, error: error.message || 'Biometric authentication failed' };
    }
  }

  async function signup(
    email: string, 
    password: string, 
    firstName?: string, 
    lastName?: string,
    age?: number,
    sex?: string,
    privacyAccepted?: boolean,
    termsAccepted?: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(`${getApiUrl()}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, firstName, lastName, age, sex, privacyAccepted, termsAccepted }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        await cacheSession(data.token, data.user);
        setToken(data.token);
        setUser(data.user);
        setIsOfflineSession(false);
        // Meta Ads attribution — fire CompleteRegistration on new account
        try {
          const { MetaAnalytics } = require('@/services/metaAnalytics');
          MetaAnalytics.logCompleteRegistration();
        } catch { /* ignore */ }
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Signup failed' };
      }
    } catch (error: any) {
      console.error('Signup error:', error);
      if (error.name === 'AbortError') {
        return { success: false, error: 'Connection timed out. Please check your internet connection.' };
      }
      return { success: false, error: 'No network connection. Please connect to the internet to create an account.' };
    }
  }

  async function logout() {
    try {
      if (token) {
        await notificationService.unregisterTokenFromServer(token);
        notificationService.removeListeners();
      }
      await clearSession();
      setToken(null);
      setUser(null);
      setIsOfflineSession(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  const refreshUser = useCallback(async () => {
    if (token) {
      await fetchUser(token);
    }
  }, [token]);

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role?.toLowerCase() === 'admin',
    isOfflineSession,
    biometricCapability,
    isBiometricEnabled,
    login,
    loginWithBiometric,
    signup,
    logout,
    refreshUser,
    setBiometricEnabled: handleSetBiometricEnabled,
    checkBiometricCapability,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
