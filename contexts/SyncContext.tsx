import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { performFullSync } from '@/services/syncService';
import { getPendingMutations, getLastSyncTime, isDatabaseAvailable, initializeDatabaseAsync } from '@/services/localDatabase';

const isNative = Platform.OS !== 'web';

interface SyncState {
  isSyncing: boolean;
  lastSyncTime: string | null;
  pendingChanges: number;
  errors: string[];
  isOnline: boolean;
}

interface SyncContextType extends SyncState {
  triggerSync: () => Promise<void>;
  clearSyncErrors: () => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    lastSyncTime: null,
    pendingChanges: 0,
    errors: [],
    isOnline: true
  });
  
  const syncInProgress = useRef(false);
  const wasOffline = useRef(false);
  const [isDatabaseInitialized, setIsDatabaseInitialized] = useState(false);
  
  // Initialize database on mount (native only)
  useEffect(() => {
    if (!isNative) {
      setIsDatabaseInitialized(true);
      return;
    }
    
    let mounted = true;
    
    const initDb = async () => {
      console.log('SyncProvider: Initializing database...');
      const success = await initializeDatabaseAsync();
      if (mounted) {
        setIsDatabaseInitialized(true);
        console.log('SyncProvider: Database initialization complete, success:', success);
      }
    };
    
    initDb();
    
    return () => {
      mounted = false;
    };
  }, []);

  const updatePendingCount = useCallback(async () => {
    if (!isNative) return;
    try {
      const mutations = await getPendingMutations();
      setSyncState(prev => ({ ...prev, pendingChanges: mutations.length }));
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      if (errorMsg.includes('clear app data') || errorMsg.includes('NullPointerException')) {
        setSyncState(prev => ({ 
          ...prev, 
          errors: ['Database unavailable. Please clear app data and restart.']
        }));
      }
    }
  }, []);

  const updateLastSyncTime = useCallback(async () => {
    if (!isNative) return;
    try {
      const lastSync = await getLastSyncTime();
      setSyncState(prev => ({ ...prev, lastSyncTime: lastSync }));
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      if (errorMsg.includes('clear app data') || errorMsg.includes('NullPointerException')) {
        setSyncState(prev => ({ 
          ...prev, 
          errors: ['Database unavailable. Please clear app data and restart.']
        }));
      }
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (!isNative) return;
    if (!token || !isOnline || syncInProgress.current) {
      return;
    }

    syncInProgress.current = true;
    setSyncState(prev => ({ ...prev, isSyncing: true, errors: [] }));

    try {
      const result = await performFullSync(token);
      
      await updatePendingCount();
      await updateLastSyncTime();
      
      if (result.errors.length > 0) {
        setSyncState(prev => ({ ...prev, errors: result.errors }));
      }
    } catch (error: any) {
      setSyncState(prev => ({
        ...prev,
        errors: [error.message || 'Sync failed']
      }));
    } finally {
      syncInProgress.current = false;
      setSyncState(prev => ({ ...prev, isSyncing: false }));
    }
  }, [token, isOnline, updatePendingCount, updateLastSyncTime]);

  const clearSyncErrors = useCallback(() => {
    setSyncState(prev => ({ ...prev, errors: [] }));
  }, []);

  useEffect(() => {
    setSyncState(prev => ({ ...prev, isOnline }));
    
    if (isNative && isDatabaseInitialized && isOnline && wasOffline.current && isAuthenticated) {
      triggerSync();
    }
    
    wasOffline.current = !isOnline;
  }, [isOnline, isAuthenticated, isDatabaseInitialized, triggerSync]);

  useEffect(() => {
    if (!isNative) return;
    if (!isDatabaseInitialized) return;
    
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && isAuthenticated && isOnline) {
        triggerSync();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, isOnline, isDatabaseInitialized, triggerSync]);

  useEffect(() => {
    if (!isNative) return;
    // Wait for database to be initialized before running sync operations
    if (!isDatabaseInitialized) return;
    
    if (isAuthenticated) {
      updatePendingCount();
      updateLastSyncTime();
      
      if (isOnline) {
        const timeout = setTimeout(() => {
          triggerSync();
        }, 1000);
        return () => clearTimeout(timeout);
      }
    }
  }, [isAuthenticated, isOnline, isDatabaseInitialized, triggerSync, updatePendingCount, updateLastSyncTime]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSyncState({
        isSyncing: false,
        lastSyncTime: null,
        pendingChanges: 0,
        errors: [],
        isOnline
      });
    }
  }, [isAuthenticated, isOnline]);

  return (
    <SyncContext.Provider
      value={{
        ...syncState,
        triggerSync,
        clearSyncErrors
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
