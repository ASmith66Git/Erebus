import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from './AuthContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { performFullSync, getSyncStatus } from '@/services/syncService';
import {
  getDatabase,
  getPendingMutations,
  getLastSyncTime,
  PendingMutation
} from '@/services/localDatabase';

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

  const updatePendingCount = useCallback(async () => {
    try {
      const mutations = await getPendingMutations();
      setSyncState(prev => ({ ...prev, pendingChanges: mutations.length }));
    } catch (error) {
      console.error('Error getting pending mutations:', error);
    }
  }, []);

  const updateLastSyncTime = useCallback(async () => {
    try {
      const lastSync = await getLastSyncTime();
      setSyncState(prev => ({ ...prev, lastSyncTime: lastSync }));
    } catch (error) {
      console.error('Error getting last sync time:', error);
    }
  }, []);

  const triggerSync = useCallback(async () => {
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
    
    if (isOnline && wasOffline.current && isAuthenticated) {
      triggerSync();
    }
    
    wasOffline.current = !isOnline;
  }, [isOnline, isAuthenticated, triggerSync]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && isAuthenticated && isOnline) {
        triggerSync();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, isOnline, triggerSync]);

  useEffect(() => {
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
  }, [isAuthenticated, isOnline, triggerSync, updatePendingCount, updateLastSyncTime]);

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
