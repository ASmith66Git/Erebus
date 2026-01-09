import { useState, useCallback } from 'react';

interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
}

export function useNetworkStatus() {
  const [networkStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    type: 'unknown'
  });

  const checkConnection = useCallback(async (): Promise<boolean> => {
    return true;
  }, []);

  return {
    ...networkStatus,
    isOnline: networkStatus.isConnected && networkStatus.isInternetReachable !== false,
    checkConnection
  };
}
